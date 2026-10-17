# 🌍 美食攻略 · 我的美食地图

一个自动旋转的 **3D 地球** 工作台：记录 **你收录过的餐厅** —— 点击城市标记下钻到街道地图，就能看到餐厅的照片和你的评价。

> A rotating 3D globe that records the restaurants you've been to — click a marker to see photos and your review.

## ✨ 功能

- 🌏 真实地球（卫星影像），支持拖动旋转、滚轮缩放、自动旋转
- 📍 收录餐厅：城市聚合标记 + 脉冲涟漪提示，点城市下钻到高德街道地图，点店铺弹出详情（城市 / 日期 / 评价 / 照片）
- 🖼 照片点击放大，支持左右翻页、键盘操作
- 🌙 / 🌍 明亮版与深色版两种地球配色

## 🚀 如何运行

**无需安装任何东西、无需联网。**

1. 下载本项目（或直接拿到整个文件夹）
2. 双击 `index.html`，在浏览器里打开即可

也可以部署到 [GitHub Pages](https://pages.github.com/)（把仓库 Settings → Pages 设成 main 分支即可），这样别人就能通过链接访问。

## ➕ 如何添加一家餐厅

打开 `data.js`，在 `RESTAURANTS` 数组里加一条：

```js
{
  name: "餐厅名字",
  city: "城市",
  lat: 39.9042,       // 纬度（告诉我城市/地址，我来帮你查）
  lng: 116.4074,      // 经度
  date: "2026-10-17",
  review: "你对它的评价……",
  photos: ["photos/某店_1.jpg", "photos/某店_2.jpg"]   // 照片放 photos/ 文件夹
}
```

## 📁 目录结构

```
index.html          主页面（双击打开）
app.js              程序逻辑
data.js             美食攻略数据
libs/               Three.js + globe.gl（3D 引擎）
img/                地球贴图（.js 为 base64 内嵌版，保证双击 file:// 也能显示）
photos/             餐厅照片（放这里）
```

## 📚 技术栈与数据来源

- [Three.js](https://threejs.org/) + [globe.gl](https://github.com/vasturiano/globe.gl)（本地引用，离线可用）
- 地球贴图：NASA Blue Marble（已内嵌为 base64，无需联网、无需本地服务器）

## 📄 开源协议

MIT License —— 欢迎 fork 和二次开发（请保留本项目出处）。
