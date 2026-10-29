/**
 * 品牌矢量 LOGO 渲染模块
 * 为各品牌设备面板左上角品牌区绘制品牌 LOGO 矢量图形（而非纯文字）。
 * 每个品牌实现一个 (h, x, y, w, hgt, brandConfig) => h('g', [...]) 绘制函数，
 * 在给定区域内绘制该品牌的标志图形（品牌主色 + 标志特征元素）。
 *
 * 说明：这些是"品牌风格"矢量图形，用于设备面板丝印展示，
 * 图形基于各品牌公开 LOGO 的特征轮廓绘制，适配深色面板底。
 *
 * 注意：h（Vue createVNode）由调用方传入，避免本模块独立 import 产生运行时不一致。
 */

/**
 * 各品牌 LOGO 绘制器。
 * 入参：h 为 Vue createVNode；x,y 为品牌区 LOGO 绘图区域左上角；w,hgt 为可用宽高；c 为品牌配置。
 * 返回一个 h('g') 元素（含 transform 平移），内部在局部坐标绘制。
 */
const logoRenderers = {
  huawei(h, x, y, w, hgt, c) {
    const fs = Math.min(5, hgt * 0.5)
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('rect', { x: 1, y: 0.5, width: 3, height: hgt - 3, fill: c.stripeColor || '#e60012', rx: 0.5 }),
      h('text', {
        x: 5.5, y: hgt * 0.72,
        'font-size': fs, 'font-weight': 'bold',
        fill: '#ffffff', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.4'
      }, 'HUAWEI'),
    ])
  },

  h3c(h, x, y, w, hgt, c) {
    const fs = Math.min(5, hgt * 0.5)
    const cx = 4
    const color = c.stripeColor || '#0088cc'
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('path', { d: `M ${cx} 2 L ${cx + 3} 2 L ${cx + 1.5} ${hgt - 3} L ${cx - 1.5} ${hgt - 3} Z`, fill: color }),
      h('path', { d: `M ${cx + 5} 2 L ${cx + 8} 2 L ${cx + 6.5} ${hgt - 3} L ${cx + 3.5} ${hgt - 3} Z`, fill: color }),
      h('path', { d: `M ${cx + 10} 2 L ${cx + 13} 2 L ${cx + 11.5} ${hgt - 3} L ${cx + 8.5} ${hgt - 3} Z`, fill: color }),
      h('text', {
        x: 15, y: hgt * 0.7, 'font-size': fs, 'font-weight': 'bold',
        fill: '#ffffff', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.3'
      }, 'H3C'),
    ])
  },

  ruijie(h, x, y, w, hgt, c) {
    // 锐捷品牌：红色「Ruijie」字母，水平正立、靠 logo 框上部，避免与型号重叠
    const color = c.stripeColor || '#d92218'
    const fs = Math.min(6, hgt * 0.55)
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('text', {
        x: 1, y: hgt * 0.58, 'font-size': fs, 'font-weight': 'bold', fill: color,
        'font-family': 'Arial, Helvetica, sans-serif'
      }, 'Ruijie'),
    ])
  },

  cisco(h, x, y, w, hgt, c) {
    const fs = Math.min(5.5, hgt * 0.5)
    const color = c.stripeColor || '#1b9ee6'
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('rect', { x: 1, y: 1, width: 2, height: hgt - 2, fill: color }),
      h('rect', { x: 4.5, y: 1, width: 2, height: hgt - 2, fill: color }),
      h('text', {
        x: 9, y: hgt * 0.7, 'font-size': fs, 'font-weight': 'bold',
        fill: '#ffffff', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.3'
      }, 'CISCO'),
    ])
  },

  juniper(h, x, y, w, hgt, c) {
    const fs = Math.min(5, hgt * 0.5)
    const color = c.stripeColor || '#64a70b'
    const r = Math.min(3, hgt * 0.3)
    const cx = 4
    const cy = hgt / 2
    const hex = []
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6
      hex.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
    }
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('polygon', { points: hex.join(' '), fill: color }),
      h('text', {
        x: 8.5, y: hgt * 0.68, 'font-size': fs, 'font-weight': 'bold',
        fill: color, 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.2'
      }, 'JUNIPER'),
    ])
  },

  fortinet(h, x, y, w, hgt, c) {
    const fs = Math.min(4.5, hgt * 0.45)
    const color = c.stripeColor || '#ee3324'
    const cx = 3.5
    const cy = hgt / 2
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('path', {
        d: `M ${cx} 1 L ${cx + 3} 2.5 L ${cx + 3} ${cy + 1} Q ${cx + 3} ${cy + 2} ${cx} ${hgt - 1.5} Q ${cx - 3} ${cy + 2} ${cx - 3} ${cy + 1} L ${cx - 3} 2.5 Z`,
        fill: color
      }),
      h('text', {
        x: 7.5, y: hgt * 0.66, 'font-size': fs, 'font-weight': 'bold',
        fill: '#ffffff', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.1'
      }, 'FORTINET'),
    ])
  },

  paloalto(h, x, y, w, hgt, c) {
    const fs = Math.min(4.2, hgt * 0.42)
    const color = c.stripeColor || '#2d6f9e'
    const cx = 3.5
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('path', { d: `M ${cx} 1 L ${cx + 3} ${hgt - 2} L ${cx - 3} ${hgt - 2} Z`, fill: color }),
      h('text', {
        x: 7.5, y: hgt * 0.65, 'font-size': fs,
        fill: '#ffffff', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.1'
      }, 'PALO ALTO'),
    ])
  },

  aruba(h, x, y, w, hgt, c) {
    const fs = Math.min(5, hgt * 0.5)
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('text', {
        x: 2, y: hgt * 0.68, 'font-size': fs, 'font-weight': 'bold',
        fill: c.stripeColor || '#ff6a00', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.3'
      }, 'ARUBA'),
    ])
  },

  hp(h, x, y, w, hgt, c) {
    const fs = Math.min(6, hgt * 0.55)
    const cx = 5
    const cy = hgt / 2
    const r = Math.min(4, hgt * 0.4)
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('circle', { cx, cy, r, fill: '#0096d6' }),
      h('text', {
        x: cx + r + 2, y: hgt * 0.68, 'font-size': fs, 'font-weight': 'bold',
        fill: '#ffffff', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.2'
      }, 'HP'),
    ])
  },

  dell(h, x, y, w, hgt, c) {
    const fs = Math.min(5.5, hgt * 0.5)
    return h('g', { transform: `translate(${x}, ${y})` }, [
      h('text', {
        x: 2, y: hgt * 0.7, 'font-size': fs, 'font-weight': 'bold',
        fill: c.stripeColor || '#007db8', 'font-family': 'Arial, Helvetica, sans-serif', 'letter-spacing': '0.3'
      }, 'DELL'),
    ])
  },
}

/**
 * 渲染品牌 LOGO 矢量图。
 * @param {Function} h Vue createVNode（由调用方传入，保证可用）
 * @param {string} key 品牌 key（huawei/h3c/ruijie/cisco/juniper/fortinet/paloalto/aruba/hp/dell）
 * @param {number} x 绘制区域左上角 x
 * @param {number} y 绘制区域左上角 y
 * @param {number} w 绘制区域宽
 * @param {number} hgt 绘制区域高
 * @param {object} brandConfig 品牌配置（需含 stripeColor 等）
 * @returns 元素|null：h('g') 元素；若该品牌无矢量图则返回 null
 */
export function renderBrandLogo(h, key, x, y, w, hgt, brandConfig) {
  const renderer = logoRenderers[key]
  if (!renderer || typeof h !== 'function') return null
  return renderer(h, x, y, w, hgt, brandConfig)
}