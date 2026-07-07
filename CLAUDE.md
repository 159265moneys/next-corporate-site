# 株式会社next コーポレートサイト

- 公開: https://159265moneys.github.io/next-corporate-site/ (GitHub Pages, mainにpushで自動反映)
- リポジトリ: https://github.com/159265moneys/next-corporate-site

## 必読
**作業開始前に必ず [PLAYBOOK.md](PLAYBOOK.md) を全文読むこと。**
デザインシステムの数値・モーション原則・実際に踏んだ地雷と恒久対策・
品質基準(「無駄にかっこいいは善」「ただの線・素フォントゼロ」)が全部そこにある。
このサイトへの変更は全てPLAYBOOK.mdの基準に従う。

## 構成
- `index.html` / `css/style.css` / `js/main.js`(演出統括) / `js/scene.js`(WebGL背景) / `js/sections.js`(セクションエンジン群)
- ビルドツールなし。CDN構成(three r128 / gsap 3.12.5 / lenis 1.1.13)
- 修正のたびに `node --check js/*.js` → commit → push(Pagesに自動反映)
