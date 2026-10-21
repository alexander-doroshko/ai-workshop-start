// The page's behaviour, in plain JavaScript for the browser: scan on submit, the skills on the
// left under their filter, the selected SKILL.md on the right. The document and the scan come in
// from outside, so the tests run the same code on the same markup.

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
  const filter = /** @type {HTMLInputElement} */ (document.getElementById('filter'));
  const matches = /** @type {HTMLElement} */ (document.getElementById('matches'));
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

  /**
   * `text` in `target`, each occurrence of `query` (in lower case) in a `<mark>`; none where lower
   * case changes the text's length, as the offsets would not match.
   * @param {Element} target
   * @param {string} text
   * @param {string} query
   */
  function highlight(target, text, query) {
    target.replaceChildren();
    const lower = text.toLowerCase();
    let start = 0;
    for (let at = query && lower.length === text.length ? lower.indexOf(query) : -1; at !== -1; at = lower.indexOf(query, start)) {
      target.append(text.slice(start, at), element('mark', '', text.slice(at, at + query.length)));
      start = at + query.length;
    }
    target.append(text.slice(start));
  }

  /**
   * Hides the skills whose name and description both miss the filter's text, ignoring case, and
   * highlights it in the others.
   * @param {Element} item
   * @param {Skill} skill
   */
  function applyFilter(item, skill) {
    const text = filter.value.trim().toLowerCase();
    const found = [skill.name, skill.description].some((field) => field.toLowerCase().includes(text));
    item.toggleAttribute('hidden', !found);
    highlight(/** @type {Element} */ (item.querySelector('.name')), skill.name, text);
    highlight(/** @type {Element} */ (item.querySelector('.description')), skill.description, text);
  }

  /** Under the filter, while it has text and there is a list: how many skills it shows, or that none match. */
  function showMatches() {
    const text = filter.value.trim();
    const shown = items.filter(([item]) => !item.hasAttribute('hidden')).length;
    const visible = text !== '' && items.length > 0;
    matches.textContent = !visible ? '' : shown > 0 ? `${shown} of ${items.length} skills` : `No skills match "${text}"`;
    matches.toggleAttribute('hidden', !visible);
  }

  /** Filters the whole list again. */
  function refilter() {
    for (const [item, skill] of items) applyFilter(item, skill);
    showMatches();
  }

  /** The list's items with their skills, for the filter. @type {[Element, Skill][]} */
  let items = [];

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
      applyFilter(item, skill);
      items.push([item, skill]);
      list.append(item);
    }
    showMatches();
  }

  filter.addEventListener('input', refilter);
  filter.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    filter.value = '';
    refilter();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    list.replaceChildren();
    items = [];
    showMatches();
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
