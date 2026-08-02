import { Hono } from "hono";
import type { Context } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";

type Bindings = { ASSETS: Fetcher; DB: D1Database };
type Variables = { requestId: string };
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403,
  ) {
    super(message);
  }
}

const origin = "https://shokugyo-jusoku.yhay81.com";
const dataPage = "https://www.mhlw.go.jp/toukei/list/114-1d.html";
const openingsWorkbook = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-06.xlsx";
const placementsWorkbook = "https://www.mhlw.go.jp/toukei/list/xls/114-1d-08.xlsx";
const termsPage = "https://www.mhlw.go.jp/toukei/list/114-1_yougo.html";
const useTerms = "https://www.mhlw.go.jp/chosakuken/index.html";
const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const eventNames = new Set([
  "visited",
  "searched",
  "no_result",
  "group_changed",
  "employment_changed",
  "year_changed",
  "occupation_added",
  "occupation_removed",
  "compared",
  "copied",
]);

const nowSeconds = () => Math.floor(Date.now() / 1000);
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const sameOrigin = (c: AppContext) => {
  const site = c.req.header("sec-fetch-site");
  if (site && site !== "same-origin") throw new ApiError("cross_site_request", 403);
  const requestOrigin = c.req.header("origin");
  if (requestOrigin && requestOrigin !== new URL(c.req.url).origin)
    throw new ApiError("cross_site_request", 403);
};
const parseJson = async (c: AppContext) => {
  if (Number(c.req.header("content-length") ?? "0") > 512)
    throw new ApiError("invalid_payload", 400);
  try {
    return await c.req.json<unknown>();
  } catch {
    throw new ApiError("invalid_json", 400);
  }
};
const record = async (c: AppContext, name: string) => {
  const session = (c.req.header("x-shokugyo-jusoku-session") ?? "").toLowerCase();
  if (!sessionPattern.test(session)) return;
  await c.env.DB.prepare(
    "INSERT INTO product_events (session_hash,event_name,is_qa,created_at) VALUES (?,?,?,?)",
  )
    .bind(
      await sha256(session),
      name,
      c.req.header("x-shokugyo-jusoku-qa") === "1" ? 1 : 0,
      nowSeconds(),
    )
    .run();
};

const nav = [
  { href: "/", label: "職種を比べる" },
  { href: "/guide", label: "数字の見方" },
  { href: "/source", label: "出典" },
  { href: "/privacy", label: "保存" },
];

const Layout = ({
  canonical,
  children,
  description,
  noindex = false,
  title,
}: {
  canonical: string;
  children: unknown;
  description: string;
  noindex?: boolean;
  title: string;
}) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta content="width=device-width, initial-scale=1" name="viewport" />
      <title>{title}</title>
      <meta content={description} name="description" />
      <link href={canonical} rel="canonical" />
      {noindex ? <meta content="noindex" name="robots" /> : null}
      <meta content="website" property="og:type" />
      <meta content="ja_JP" property="og:locale" />
      <meta content={title} property="og:title" />
      <meta content={description} property="og:description" />
      <meta content={canonical} property="og:url" />
      <meta content={`${origin}/og.svg`} property="og:image" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="#29352f" name="theme-color" />
      <link href="/favicon.svg" rel="icon" type="image/svg+xml" />
      <link href="/manifest.webmanifest" rel="manifest" />
      <link href="/styles.css" rel="stylesheet" />
    </head>
    <body>
      <header class="site-header">
        <a aria-label="職種充足率 ホーム" class="brand" href="/">
          <span aria-hidden="true" class="brand-mark">
            <i />
            <i />
          </span>
          <span>職種充足率</span>
        </a>
        <nav aria-label="主なページ">
          {nav.map((item) => (
            <a href={item.href}>{item.label}</a>
          ))}
        </nav>
      </header>
      {children}
      <footer>
        <div>
          <strong>職種充足率</strong>
          <p>厚生労働省「職業安定業務統計 雇用関係指標」を加工して作成</p>
        </div>
        <div class="footer-links">
          <a href="/source">出典と注意</a>
          <a href="/privacy">保存と計測</a>
          <a href="https://github.com/yhay81/shokugyo-jusoku">ソースコード</a>
        </div>
      </footer>
    </body>
  </html>
);

const FulfillmentRackFigure = () => (
  <div
    aria-label="一般事務の求人枠10個のうち3個に就職確認票が入り、充足率28.04%を示す棚"
    class="fulfillment-rack"
    role="img"
  >
    <div class="rack-header" aria-hidden="true">
      <span>25 · 一般事務</span>
      <b>全国計 · 2025</b>
    </div>
    <div class="vacancy-grid" aria-hidden="true">
      <i class="is-filled">
        <span>済</span>
      </i>
      <i class="is-filled">
        <span>済</span>
      </i>
      <i class="is-filled">
        <span>済</span>
      </i>
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </div>
    <div class="rack-meter" aria-hidden="true">
      <div>
        <span>就職確認</span>
        <strong>169,069</strong>
      </div>
      <b>÷</b>
      <div>
        <span>新規求人</span>
        <strong>602,900</strong>
      </div>
      <i>=</i>
      <em>28.04%</em>
    </div>
  </div>
);

const HomePage = () => (
  <Layout
    canonical={`${origin}/`}
    description="ハローワーク全国計の新規求人数と就職件数から、73職種の公式充足率と元件数を2023〜2025年度、3雇用区分で最大4職種まで比較できます。"
    title="全国の職種別充足率を比較 | 職種充足率"
  >
    <main>
      <section class="hero-shell">
        <div class="hero-copy">
          <p class="period-label">2023—2025年度 · ハローワーク全国計</p>
          <h1>求人の空きを、就職確認でどこまで埋めたか。</h1>
          <p class="lead">全国の職種ごとに、公式の充足率と新規求人・就職の2値を並べます。</p>
          <div aria-label="収録内容" class="hero-facts">
            <span>
              <b>73</b> 職種
            </span>
            <span>
              <b>3</b> 雇用区分
            </span>
            <span>
              <b>最大4</b> 職種比較
            </span>
          </div>
        </div>
        <FulfillmentRackFigure />
      </section>

      <section aria-labelledby="compare-title" class="compare-workbench">
        <div class="section-heading">
          <div>
            <p class="section-kicker">充足棚</p>
            <h2 id="compare-title">選んだ職種を並べる</h2>
          </div>
          <div class="compare-tools">
            <span id="compare-count">0 / 4</span>
            <button disabled id="copy-compare" type="button">
              比較をコピー
            </button>
          </div>
        </div>
        <div class="metric-controls">
          <label>
            <span>雇用区分</span>
            <select id="employment">
              <option value="a">パートを含む常用</option>
              <option value="f">パートを除く常用</option>
              <option value="t">常用的パート</option>
            </select>
          </label>
          <label>
            <span>年度</span>
            <select id="year">
              <option value="2025">2025年度</option>
              <option value="2024">2024年度</option>
              <option value="2023">2023年度</option>
            </select>
          </label>
        </div>
        <p class="metric-note">
          全国計の就職件数 ÷ 新規求人数です。率と同時に2つの元件数を表示します。
        </p>
        <div class="comparison-grid" id="compare-list">
          <div class="empty-compare">下の職種カードから、比べたい仕事を選んでください。</div>
        </div>
      </section>

      <section aria-labelledby="catalogue-title" class="catalogue">
        <div class="section-heading">
          <div>
            <p class="section-kicker">職種カード</p>
            <h2 id="catalogue-title">比べる仕事を選ぶ</h2>
          </div>
          <p id="data-status" role="status">
            公式表を読み込んでいます
          </p>
        </div>
        <div class="catalogue-controls">
          <label class="search-field">
            <span>職種名</span>
            <input
              autocomplete="off"
              id="search"
              placeholder="例：事務、介護、情報"
              type="search"
            />
          </label>
          <label>
            <span>分類</span>
            <select id="group">
              <option value="all">すべての分類</option>
            </select>
          </label>
        </div>
        <div class="occupation-grid" id="occupation-list" />
      </section>

      <aside class="boundary">
        <span aria-hidden="true" class="boundary-mark">
          済
        </span>
        <div>
          <strong>個別求人の成約率や、同じ年度に出た求人の追跡結果ではありません</strong>
          <p>
            全国計の公式定義による比率です。採用確率、求人の質、未充足数、賃金、民間求人を含む市場全体は示しません。
          </p>
        </div>
      </aside>
    </main>
    <script defer src="/app.js" />
  </Layout>
);

const GuidePage = () => (
  <Layout
    canonical={`${origin}/guide`}
    description="職種充足率の新規求人数、就職件数、全国計だけを収録する理由、年度値、雇用区分の読み方を説明します。"
    title="数字の見方 | 職種充足率"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">数字の見方</p>
        <h1>全国計の公式式を、そのまま使う。</h1>
        <p>厚生労働省の定義に従い、就職件数を同じ職種・雇用区分・年度の新規求人数で除します。</p>
      </div>
      <section class="formula-sheet" aria-label="全国計の職種充足率の計算方法">
        <div>
          <span>就職件数</span>
          <strong>169,069</strong>
        </div>
        <b>÷</b>
        <div>
          <span>新規求人数</span>
          <strong>602,900</strong>
        </div>
        <i>=</i>
        <div class="formula-result">
          <span>充足率</span>
          <strong>28.04%</strong>
        </div>
      </section>
      <section class="guide-grid">
        <article>
          <span>分子</span>
          <h2>就職件数</h2>
          <p>
            有効求職者が就職したことを確認した件数です。当該年度の新規求人だけを追跡した値ではありません。
          </p>
        </article>
        <article>
          <span>分母</span>
          <h2>新規求人数</h2>
          <p>期間中に新たに受け付けた求人の採用予定人員です。求人票の枚数とは一致しません。</p>
        </article>
        <article>
          <span>年度値</span>
          <h2>年度内の公表件数</h2>
          <p>
            月次の件数を年度で合計した値です。同一求人と就職を結び付けたコホートデータではありません。
          </p>
        </article>
        <article>
          <span>雇用区分</span>
          <h2>3つの公式値</h2>
          <p>パートを含む常用、パートを除く常用、常用的パートを切り替えます。</p>
        </article>
      </section>
      <section class="note-panel">
        <h2>全国計だけを収録します</h2>
        <p>
          公式定義は全国計を「就職件数 ÷ 新規求人数」、都道府県別を「充足数 ÷
          新規求人数」としています。職種別の都道府県充足数はこの公表表にないため、就職件数で代用せず全国計だけを掲載します。
        </p>
        <a href={termsPage}>厚生労働省 用語の解説</a>
      </section>
    </main>
  </Layout>
);

const SourcePage = () => (
  <Layout
    canonical={`${origin}/source`}
    description="職種充足率が使う厚生労働省第6表・第8表、全国計657組の照合、地域値を掲載しない理由、確認日、利用条件を示します。"
    title="出典と注意 | 職種充足率"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">出典</p>
        <h1>全国計657組を、2つの公式表から。</h1>
        <p>2026年8月2日に取得した現行Excelを、職種コード・雇用区分・年度で対応づけました。</p>
      </div>
      <section class="source-grid">
        <article>
          <span>第6表</span>
          <h2>職業別新規求人数</h2>
          <p>全国・47労働局、73職種、3雇用区分、2023〜2025年度の採用予定人員。</p>
          <a href={openingsWorkbook}>原表Excel</a>
        </article>
        <article>
          <span>第8表</span>
          <h2>職業別就職件数</h2>
          <p>全国・47労働局、73職種、3雇用区分、2023〜2025年度の就職確認件数。</p>
          <a href={placementsWorkbook}>原表Excel</a>
        </article>
      </section>
      <section class="source-detail">
        <h2>照合と範囲</h2>
        <dl>
          <div>
            <dt>公開</dt>
            <dd>全国計73職種 × 3雇用区分 × 3年度の657組・1,314元値。欠測と分母0はありません。</dd>
          </div>
          <div>
            <dt>検査</dt>
            <dd>
              元表全体で雇用区分の加算関係を20,890セル、全国計と47労働局合計を1,302セル確認しました。
            </dd>
          </div>
          <div>
            <dt>地域値</dt>
            <dd>
              都道府県の公式充足率には充足数が必要です。就職件数で代用せず、画面へ掲載しません。
            </dd>
          </div>
          <div>
            <dt>範囲</dt>
            <dd>
              公共職業安定所の取扱件数です。個別求人の追跡値や民間求人を含む市場全体ではありません。
            </dd>
          </div>
        </dl>
      </section>
      <section class="provenance-note">
        <p>
          第6表: 991,012 bytes · SHA-256
          99e2cad815251763fdb05265e6a8b0be29d04db9615e997646db402591dca8c2
        </p>
        <p>
          第8表: 931,773 bytes · SHA-256
          d1ed45ec4ab82f1ba64cf5b923e1dd74528ffd7b13df8d4d1665b5e1d93f4256
        </p>
      </section>
      <section class="link-row">
        <a href={dataPage}>雇用関係指標（年度）</a>
        <a href={termsPage}>用語の解説</a>
        <a href={useTerms}>厚生労働省の利用条件</a>
      </section>
    </main>
  </Layout>
);

const PrivacyPage = () => (
  <Layout
    canonical={`${origin}/privacy`}
    description="職種充足率の端末保存、匿名利用計測、保持期間、追跡拒否への対応を示します。"
    title="保存と計測 | 職種充足率"
  >
    <main class="text-page">
      <div class="page-intro">
        <p class="section-kicker">保存</p>
        <h1>選んだ職種は、端末に。</h1>
        <p>検索語、職種名、年度、雇用区分、件数、割合をサーバーへ記録しません。</p>
      </div>
      <section class="privacy-grid">
        <article>
          <h2>端末に保存</h2>
          <p>比較に選んだ公開職種IDを最大4件だけブラウザへ保存します。アカウントは不要です。</p>
        </article>
        <article>
          <h2>操作名だけを計測</h2>
          <p>訪問、検索、0件、条件変更、比較への追加・削除、コピーの操作名だけを計測します。</p>
        </article>
        <article>
          <h2>35日で削除</h2>
          <p>
            ランダムなセッションIDをSHA-256で変換し、操作名、QA区分、時刻とともにD1へ保存します。
          </p>
        </article>
        <article>
          <h2>追跡拒否を尊重</h2>
          <p>
            Do Not TrackまたはGlobal Privacy
            Controlが有効な場合は計測しません。広告・外部解析・Cookieは使いません。
          </p>
        </article>
      </section>
    </main>
  </Layout>
);

export const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-Request-Id", c.get("requestId"));
});
app.use(
  "*",
  jsxRenderer(({ children }) => <>{children}</>),
);
app.get("/", (c) => c.html(<HomePage />));
app.get("/guide", (c) => c.html(<GuidePage />));
app.get("/source", (c) => c.html(<SourcePage />));
app.get("/privacy", (c) => c.html(<PrivacyPage />));
app.post("/api/telemetry", async (c) => {
  sameOrigin(c);
  const body = await parseJson(c);
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    typeof body.name !== "string" ||
    !eventNames.has(body.name)
  )
    throw new ApiError("invalid_event", 400);
  await record(c, body.name);
  return c.body(null, 202);
});
app.get("/health", async (c) => {
  const row = await c.env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return c.json({
    asOf: "2026-08-02",
    ok: row?.ok === 1,
    records: 657,
    service: "shokugyo-jusoku",
  });
});
app.get("/sitemap.xml", (c) => {
  const paths = ["/", "/guide", "/source", "/privacy"];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${origin}${path}</loc></url>`).join("")}</urlset>`;
  c.header("Cache-Control", "public,max-age=300,s-maxage=300");
  c.header("Content-Type", "application/xml; charset=utf-8");
  return c.body(xml);
});
app.notFound((c) => {
  c.status(404);
  return c.html(
    <Layout
      canonical={`${origin}/404`}
      description="指定されたページは見つかりません。"
      noindex
      title="ページが見つかりません | 職種充足率"
    >
      <main class="text-page">
        <div class="page-intro">
          <p class="section-kicker">404</p>
          <h1>この求人枠は見つかりません。</h1>
          <p>
            <a href="/">職種の比較へ戻る</a>
          </p>
        </div>
      </main>
    </Layout>,
  );
});
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ error: error.message, requestId: c.get("requestId") }, error.status);
  console.error(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
      requestId: c.get("requestId"),
    }),
  );
  return c.json({ error: "internal_error", requestId: c.get("requestId") }, 500);
});

export const scheduled = async (_event: ScheduledEvent, env: Bindings, _ctx: ExecutionContext) => {
  await env.DB.prepare("DELETE FROM product_events WHERE created_at < ?")
    .bind(nowSeconds() - 35 * 86400)
    .run();
};

export default app;
