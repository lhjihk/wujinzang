# 無盡藏 · WUJINZANG

私人佛典壁画画廊与在线读经站。纯静态，零构建，克隆即成品。

- `index.html` 梵境（主页）：朝元图横向展卷 · 四壁画廊 · 香烟流体
- `canon.html` 藏經閣：《嘉兴藏》285 部全目 + 竖排乌丝栏阅读器（纸/夜/墨水屏三主题）
- `admin.html` 編輯台（隐藏页，无入口链接）：文案表单 + EPUB 上架通道，经 GitHub API 直接提交
- `data/content.json` 全站唯一文案数据源
- `data/catalog.json` 嘉兴藏书目（从 CBETA epub 元数据提取）
- `data/texts/*.json` 已上架全文（心经 T0251 / 金刚经 T0235 先行）
- `data/available.json` 编辑台上传后维护的可读清单

部署：GitHub Pages（Settings → Pages → main / root）或任意静态服务器。
不能用 file:// 直接打开（boot.js 要 fetch JSON）。

壁画原件均为公有领域高清扫描（Wikimedia Commons / Google Arts & Culture）；
经文取自 CBETA 电子佛典。完整维护手册见部署机桌面《無盡藏佛典网站-部署与维护手册》。
