const $ = (selector) => document.querySelector(selector);
const elements = {
  compareCount: $("#compare-count"),
  compareList: $("#compare-list"),
  copy: $("#copy-compare"),
  employment: $("#employment"),
  group: $("#group"),
  list: $("#occupation-list"),
  search: $("#search"),
  status: $("#data-status"),
  year: $("#year"),
};

const storageKey = "shokugyo-jusoku:occupations:v1";
const defaultSelection = ["10", "25", "36"];
const state = { index: null, records: new Map(), selected: [] };

const dnt = navigator.doNotTrack === "1" || navigator.globalPrivacyControl === true;
const qa = new URLSearchParams(location.search).get("qa") === "1" || navigator.webdriver === true;
let session = sessionStorage.getItem("shokugyo-jusoku:session");
if (!session && !dnt) {
  session = crypto.randomUUID();
  sessionStorage.setItem("shokugyo-jusoku:session", session);
}
const track = (name) => {
  if (!session || dnt) return;
  void fetch("/api/telemetry", {
    body: JSON.stringify({ name }),
    headers: {
      "content-type": "application/json",
      "x-shokugyo-jusoku-qa": qa ? "1" : "0",
      "x-shokugyo-jusoku-session": session,
    },
    keepalive: true,
    method: "POST",
  }).catch(() => {});
};

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>'"]/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character],
  );
const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("ja").trim();
const integer = new Intl.NumberFormat("ja-JP");
const yearIndex = () => state.index.years.indexOf(Number(elements.year.value));
const currentPair = (record) => record[elements.employment.value][yearIndex()];
const rateFor = ([openings, placements]) =>
  openings === null || placements === null || openings === 0 ? null : (placements / openings) * 100;
const rateText = (pair) => {
  const rate = rateFor(pair);
  return rate === null ? "算出なし" : `${rate.toFixed(2)}%`;
};

const loadSelected = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (Array.isArray(stored)) return stored.filter((item) => typeof item === "string").slice(0, 4);
  } catch {}
  return [...defaultSelection];
};
const saveSelected = () => localStorage.setItem(storageKey, JSON.stringify(state.selected));

const yearStrip = (record) =>
  `<div class="year-strip">${state.index.years
    .map((year, index) => {
      const pair = record[elements.employment.value][index];
      return `<div class="year-cell${year === Number(elements.year.value) ? " is-current" : ""}"><span>${year}</span><b>${rateText(pair)}</b></div>`;
    })
    .join("")}</div>`;

const renderCompare = () => {
  elements.compareCount.textContent = `${state.selected.length} / 4`;
  elements.copy.disabled = state.selected.length === 0;
  if (state.selected.length === 0) {
    elements.compareList.innerHTML =
      '<div class="empty-compare">下の職種カードから、比べたい仕事を選んでください。</div>';
    return;
  }
  elements.compareList.innerHTML = state.selected
    .map((id) => {
      const occupation = state.index.occupations.find((item) => item.id === id);
      const record = state.records.get(id);
      const pair = currentPair(record);
      const rate = rateFor(pair);
      return `<article class="comparison-card">
        <div class="comparison-title">
          <span>${occupation.group} · ${occupation.id}</span>
          <button aria-label="${escapeHtml(occupation.name)}を比較から外す" data-remove="${id}" type="button">×</button>
        </div>
        <h3>${escapeHtml(occupation.name)}</h3>
        <div class="rate-display"><span>充足率</span><strong>${rateText(pair)}</strong></div>
        <div aria-hidden="true" class="rate-track"><i style="width:${Math.min(rate ?? 0, 100).toFixed(2)}%"></i></div>
        <dl class="breakdown">
          <div><dt>就職件数</dt><dd>${pair[1] === null ? "公表なし" : integer.format(pair[1])}</dd></div>
          <div><dt>新規求人数</dt><dd>${pair[0] === null ? "公表なし" : integer.format(pair[0])}</dd></div>
        </dl>
        ${yearStrip(record)}
      </article>`;
    })
    .join("");
  for (const button of elements.compareList.querySelectorAll("[data-remove]"))
    button.addEventListener("click", () => removeOccupation(button.dataset.remove));
};

const visibleOccupations = () => {
  const query = normalize(elements.search.value);
  const group = elements.group.value;
  return state.index.occupations.filter(
    (occupation) =>
      (group === "all" || occupation.group === group) &&
      (!query || normalize(`${occupation.id} ${occupation.name}`).includes(query)),
  );
};
const renderCatalogue = () => {
  const occupations = visibleOccupations();
  elements.status.textContent = `${occupations.length} / ${state.index.occupationCount} 職種`;
  elements.list.innerHTML = occupations
    .map((occupation) => {
      const selected = state.selected.includes(occupation.id);
      const full = state.selected.length >= 4 && !selected;
      const pair = currentPair(state.records.get(occupation.id));
      return `<article class="occupation-card${selected ? " is-selected" : ""}">
        <div class="occupation-code"><span>${occupation.group}</span><b>${occupation.id}</b></div>
        <h3>${escapeHtml(occupation.name)}</h3>
        <p>充足率 ${rateText(pair)}</p>
        <button aria-pressed="${selected}" ${full ? "disabled" : ""} data-select="${occupation.id}" type="button">${selected ? "比較中" : "比較に追加"}</button>
      </article>`;
    })
    .join("");
  for (const button of elements.list.querySelectorAll("[data-select]"))
    button.addEventListener("click", () => toggleOccupation(button.dataset.select));
  if (occupations.length === 0) track("no_result");
};

const renderAll = () => {
  renderCompare();
  renderCatalogue();
};
const toggleOccupation = (id) => {
  if (state.selected.includes(id)) return removeOccupation(id);
  if (state.selected.length >= 4) return;
  state.selected.push(id);
  saveSelected();
  track("occupation_added");
  if (state.selected.length >= 2) track("compared");
  renderAll();
};
const removeOccupation = (id) => {
  state.selected = state.selected.filter((item) => item !== id);
  saveSelected();
  track("occupation_removed");
  renderAll();
};

const employmentLabel = () => elements.employment.selectedOptions[0].textContent;
const copyComparison = async () => {
  const lines = state.selected.map((id) => {
    const occupation = state.index.occupations.find((item) => item.id === id);
    const pair = currentPair(state.records.get(id));
    return `${occupation.name}: ${rateText(pair)}（就職 ${integer.format(pair[1])} ÷ 新規求人 ${integer.format(pair[0])}）`;
  });
  const text = [
    `職種充足率｜全国計・${elements.year.value}年度・${employmentLabel()}`,
    ...lines,
    "全国計の公式式（就職件数 ÷ 新規求人数）。個別求人の追跡結果ではありません。",
    location.origin,
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    const old = elements.copy.textContent;
    elements.copy.textContent = "コピーしました";
    setTimeout(() => (elements.copy.textContent = old), 1600);
    track("copied");
  } catch {
    elements.copy.textContent = "コピーできませんでした";
  }
};

const start = async () => {
  const [indexResponse, dataResponse] = await Promise.all([
    fetch("/data/index.json"),
    fetch("/data/rates.json"),
  ]);
  if (!indexResponse.ok || !dataResponse.ok) throw new Error("data_fetch_failed");
  const [index, records] = await Promise.all([indexResponse.json(), dataResponse.json()]);
  state.index = index;
  state.records = new Map(records.map((record) => [record.o, record]));
  const validIds = new Set(index.occupations.map((item) => item.id));
  state.selected = loadSelected()
    .filter((id) => validIds.has(id))
    .slice(0, 4);
  for (const group of index.groups) {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = `${group.id} ${group.name}`;
    elements.group.append(option);
  }
  renderAll();
  track("visited");
};

let searchTimer;
elements.search.addEventListener("input", () => {
  renderCatalogue();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (elements.search.value.trim()) track("searched");
  }, 500);
});
elements.group.addEventListener("change", () => {
  track("group_changed");
  renderCatalogue();
});
elements.employment.addEventListener("change", () => {
  track("employment_changed");
  renderAll();
});
elements.year.addEventListener("change", () => {
  track("year_changed");
  renderAll();
});
elements.copy.addEventListener("click", copyComparison);

start().catch(() => {
  elements.status.textContent =
    "データを読み込めませんでした。時間をおいて再読み込みしてください。";
  elements.list.innerHTML = '<p class="load-error">公式表データの読み込みに失敗しました。</p>';
});
