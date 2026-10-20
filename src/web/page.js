// The page's behaviour, in plain JavaScript for the browser: scan on submit, the skills on the
// left, the selected SKILL.md on the right. The document and the scan come in from outside, so
// the tests run the same code on the same markup.

/**
 * @typedef {{ name: string, description: string, path: string, link: string, text: string, copies: string[] }} Skill
 * @typedef {{ repository: { id: string }, skills: Skill[], warnings: string[] }} Result
 * @typedef {(repo: string) => Promise<{ ok: boolean, json(): Promise<unknown> }>} Scan
 */

/**
 * Wires the page in `document` to `scan`; the browser passes a fetch of `/api/scan`.
 * @param {Document} document
 * @param {Scan} scan
 */
export function start(document, scan) {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('scan'));
  const input = /** @type {HTMLInputElement} */ (document.getElementById('repo'));
  const button = /** @type {HTMLButtonElement} */ (form.querySelector('button'));
  const status = /** @type {HTMLElement} */ (document.getElementById('status'));
  const list = /** @type {HTMLElement} */ (document.getElementById('skills'));
  const view = /** @type {HTMLElement} */ (document.getElementById('skill'));

  /** @param {string} text */
  function setStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }

  /**
   * @param {string} tag
   * @param {string} className
   * @param {string} text
   */
  function element(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
  }

  /**
   * The SKILL.md on the right: its pinned link, its copies, its text.
   * @param {Skill} skill
   * @param {Element} item
   */
  function show(skill, item) {
    for (const other of Array.from(list.children)) other.setAttribute('aria-selected', String(other === item));
    const link = /** @type {HTMLAnchorElement} */ (element('a', 'link', skill.link));
    link.href = skill.link;
    link.target = '_blank';
    view.replaceChildren(link);
    if (skill.copies.length > 0) view.append(element('div', 'copies', `also in ${skill.copies.join(', ')}`));
    view.append(element('pre', 'text', skill.text));
  }

  /** @param {Result} result */
  function showResult({ repository, skills, warnings }) {
    const count = `${repository.id} · ${skills.length} ${skills.length === 1 ? 'skill' : 'skills'}`;
    setStatus([count, ...warnings.map((warning) => `warning: ${warning}`)].join('\n'));
    for (const skill of skills) {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.title = skill.path;
      item.append(element('div', 'name', skill.name), element('div', 'description', skill.description));
      item.addEventListener('click', () => show(skill, item));
      list.append(item);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    list.replaceChildren();
    view.replaceChildren();
    button.disabled = true;
    setStatus('Scanning…');
    try {
      const response = await scan(input.value);
      const result = await response.json();
      if (response.ok) showResult(/** @type {Result} */ (result));
      else setStatus(/** @type {{ error: string }} */ (result).error, true);
    } catch (error) {
      setStatus(`Cannot reach the Skill Atlas server: ${error instanceof Error ? error.message : String(error)}`, true);
    } finally {
      button.disabled = false;
    }
  });
}
