import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative } from "node:path";
import { watch } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const contentDir = join(root, "content", "posts");
const publicDir = join(root, "public");
const distDir = join(root, "dist");
const stylesPath = join(root, "src", "styles.css");
const basePath = (process.env.BASE_PATH || "").replace(/\/$/, "");

const site = {
  title: "平田和月の情シスノート",
  author: "平田和月",
  kana: "ヒラタワツキ",
  description: "情シスの現場で得た知見を、運用・セキュリティ・業務改善の視点で整理する個人ブログ。",
  url: ""
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withBase(path) {
  if (!basePath) return path;
  return `${basePath}${path}`;
}

function slugify(value) {
  return value
    .replace(/\.md$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9一-龠ぁ-んァ-ヶー]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFrontMatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: source };
  }

  const data = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    const raw = rest.join(":").trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      data[key.trim()] = raw
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    } else {
      data[key.trim()] = raw.replace(/^"|"$/g, "");
    }
  }

  return { data, body: match[2].trim() };
}

function inlineMarkdown(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToHtml(markdown) {
  const blocks = markdown.split(/\n{2,}/);
  const html = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("## ")) {
      html.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      html.push(`<h1>${inlineMarkdown(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.split("\n").every((line) => line.startsWith("- "))) {
      const items = trimmed
        .split("\n")
        .map((line) => `<li>${inlineMarkdown(line.slice(2))}</li>`)
        .join("");
      html.push(`<ul>${items}</ul>`);
      continue;
    }

    html.push(`<p>${inlineMarkdown(trimmed).replaceAll("\n", "<br>")}</p>`);
  }

  return html.join("\n");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(`${value}T00:00:00+09:00`));
}

async function readPosts() {
  const files = (await readdir(contentDir)).filter((file) => file.endsWith(".md"));
  const posts = await Promise.all(files.map(async (file) => {
    const source = await readFile(join(contentDir, file), "utf8");
    const { data, body } = parseFrontMatter(source);
    const slug = data.slug || slugify(file);

    return {
      slug,
      title: data.title || slug,
      date: data.date || "1970-01-01",
      excerpt: data.excerpt || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      body,
      html: markdownToHtml(body),
      outputPath: join(distDir, "posts", slug, "index.html"),
      href: withBase(`/posts/${slug}/`)
    };
  }));

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

function tagList(tags) {
  return `<div class="topics">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function layout({ title, description, body }) {
  const fullTitle = title === site.title ? title : `${title} | ${site.title}`;
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description || site.description)}">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description || site.description)}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${withBase("/assets/hero-systems-blog.png")}">
  <link rel="stylesheet" href="${withBase("/styles.css")}">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="${withBase("/")}">
      <span class="brand-mark">HW</span>
      <span class="brand-title">${escapeHtml(site.title)}</span>
      <span class="brand-short">情シスノート</span>
    </a>
    <nav class="nav" aria-label="メインナビゲーション">
      <a href="${withBase("/#posts")}">記事</a>
      <a href="${withBase("/#profile")}">プロフィール</a>
    </nav>
  </header>
  ${body}
  <footer class="footer">
    <div class="footer-inner">
      <span>© ${new Date().getFullYear()} ${escapeHtml(site.author)}</span>
    </div>
  </footer>
</body>
</html>`;
}

function homePage(posts) {
  const cards = posts.map((post) => `<a class="post-card" href="${post.href}">
  <time class="post-date" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
  <div>
    <h3>${escapeHtml(post.title)}</h3>
    <p>${escapeHtml(post.excerpt)}</p>
    ${tagList(post.tags)}
  </div>
</a>`).join("\n");

  return layout({
    title: site.title,
    description: site.description,
    body: `<section class="hero">
  <div class="hero-inner">
    <h1>平田和月の情シスノート</h1>
    <p>現場で続くセキュリティ、説明しやすい運用、会社に馴染むIT改善を、実務目線で整理していきます。</p>
  </div>
</section>
<main class="main">
  <section class="posts" id="posts">
    <h2 class="section-title">記事</h2>
    <div class="post-grid">${cards}</div>
  </section>
  <section class="intro" id="profile">
    <div>
      <h2>プロフィール</h2>
      <p>アカウント管理、SaaS選定、端末運用、問い合わせ対応、セキュリティ啓発。日々の業務で見つけた考え方やチェックリストを、明日から使える粒度で書きます。</p>
      <div class="topics">
        <span class="tag">セキュリティ</span>
        <span class="tag">SaaS運用</span>
        <span class="tag">業務改善</span>
        <span class="tag">アカウント管理</span>
      </div>
    </div>
    <aside class="profile-panel">
      <h3>${escapeHtml(site.author)}（${escapeHtml(site.kana)}）</h3>
      <p>情シス領域の実務から、低コストで堅実に回るIT運用を発信。難しいことを、現場に届く言葉に直すのがテーマです。</p>
    </aside>
  </section>
</main>`
  });
}

function articlePage(post) {
  return layout({
    title: post.title,
    description: post.excerpt,
    body: `<main class="article-shell">
  <article>
    <header class="article-header">
      <div class="article-meta">${formatDate(post.date)}</div>
      <h1>${escapeHtml(post.title)}</h1>
      ${tagList(post.tags)}
    </header>
    <div class="article-body">${post.html}</div>
  </article>
</main>`
  });
}

async function copyPublic() {
  const entries = await readdir(publicDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const source = join(entry.parentPath, entry.name);
    const target = join(distDir, relative(publicDir, source));
    await mkdir(new URL(".", `file://${target}`).pathname, { recursive: true });
    await copyFile(source, target);
  }
}

async function build() {
  const posts = await readPosts();
  await rm(distDir, { recursive: true, force: true });
  await mkdir(join(distDir, "posts"), { recursive: true });
  await copyPublic();
  await writeFile(join(distDir, "styles.css"), await readFile(stylesPath, "utf8"));
  await writeFile(join(distDir, ".nojekyll"), "");
  await writeFile(join(distDir, "index.html"), homePage(posts));

  for (const post of posts) {
    await mkdir(join(distDir, "posts", post.slug), { recursive: true });
    await writeFile(post.outputPath, articlePage(post));
  }

  const sitemap = posts
    .map((post) => `${site.url}${post.href}`)
    .join("\n");
  await writeFile(join(distDir, "sitemap.txt"), `${site.url}/\n${sitemap}\n`);

  return posts.length;
}

function contentType(pathname) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".txt": "text/plain; charset=utf-8"
  };
  return types[extname(pathname)] || "application/octet-stream";
}

async function serve() {
  const port = 4173;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    const candidate = pathname.endsWith("/")
      ? join(distDir, pathname, "index.html")
      : join(distDir, pathname);

    try {
      const file = await readFile(candidate);
      response.writeHead(200, { "content-type": contentType(candidate) });
      response.end(file);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Not found: ${relative(distDir, candidate)}`);
    }
  });

  server.listen(port, () => {
    console.log(`http://localhost:${port}`);
  });
}

const args = new Set(process.argv.slice(2));
const count = await build();
console.log(`Built ${count} posts.`);

if (args.has("--watch")) {
  console.log("Watching content and source files...");
  watch(join(root, "content"), { recursive: true }, async () => {
    const nextCount = await build();
    console.log(`Rebuilt ${nextCount} posts.`);
  });
  watch(join(root, "src"), { recursive: true }, async () => {
    const nextCount = await build();
    console.log(`Rebuilt ${nextCount} posts.`);
  });
}

if (args.has("--serve")) {
  await serve();
}
