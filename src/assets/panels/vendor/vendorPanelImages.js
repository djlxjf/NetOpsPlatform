/**
 * 海康/大华设备面板图源注册表
 * 源自 nVisual 迁移导出（.nvl node_type_image），正面板 PNG 直接应用。
 * 图内自带挂耳已裁除（左右各 4%），上架后挂耳由 RackEarsComponent 统一渲染。
 * 生成脚本：.temp/vendor-panels/process_panels.py（manifest 驱动）
 */
import hikvision_vdaaeu6f from './hikvision/vdaaeu6f.png'
import hikvision_nmmp5fm3 from './hikvision/nmmp5fm3.png'
import hikvision_okk0m2vm from './hikvision/okk0m2vm.png'
import hikvision_vcdpa8nx from './hikvision/vcdpa8nx.png'
import hikvision_fam3710u from './hikvision/fam3710u.png'
import hikvision_xuic9lzr from './hikvision/xuic9lzr.png'
import hikvision_evbjn6ar from './hikvision/evbjn6ar.png'
import hikvision_if6qmfth from './hikvision/if6qmfth.png'
import hikvision_xixa1tg6 from './hikvision/xixa1tg6.png'
import hikvision_bokt6nit from './hikvision/bokt6nit.png'
import hikvision_frecdoeh from './hikvision/frecdoeh.png'
import hikvision_vcbc97j9 from './hikvision/vcbc97j9.png'
import hikvision_itegr1n2 from './hikvision/itegr1n2.png'
import hikvision_omadsmyp from './hikvision/omadsmyp.png'
import hikvision_3rufuylc from './hikvision/3rufuylc.png'
import hikvision_ubvkbawp from './hikvision/ubvkbawp.png'
import hikvision_bhnl1hsa from './hikvision/bhnl1hsa.png'
import hikvision_ux4kjweq from './hikvision/ux4kjweq.png'
import hikvision_x3hanriy from './hikvision/x3hanriy.png'
import hikvision_ayav9hnc from './hikvision/ayav9hnc.png'
import hikvision_5bpeof7u from './hikvision/5bpeof7u.png'
import hikvision_bphgkwii from './hikvision/bphgkwii.png'
import hikvision_exyjgsgk from './hikvision/exyjgsgk.png'
import hikvision_ma3hulqu from './hikvision/ma3hulqu.png'
import hikvision_dtimecob from './hikvision/dtimecob.png'
import hikvision_4wzxihwh from './hikvision/4wzxihwh.png'
import hikvision_vwtbudru from './hikvision/vwtbudru.png'
import hikvision_lxcqrszy from './hikvision/lxcqrszy.png'
import hikvision_n9xqtndl from './hikvision/n9xqtndl.png'
import hikvision_zdfarvrr from './hikvision/zdfarvrr.png'
import hikvision_qurfzlvn from './hikvision/qurfzlvn.png'
import hikvision_cltzpjc1 from './hikvision/cltzpjc1.png'
import hikvision_arobgnor from './hikvision/arobgnor.png'
import hikvision_9a09kw6b from './hikvision/9a09kw6b.png'
import hikvision_uhyese1c from './hikvision/uhyese1c.png'
import hikvision_ekclglpr from './hikvision/ekclglpr.png'
import hikvision_9egzq1fn from './hikvision/9egzq1fn.png'
import hikvision_m4togelj from './hikvision/m4togelj.png'
import hikvision_s3fwb150 from './hikvision/s3fwb150.png'
import hikvision_rerfrpuu from './hikvision/rerfrpuu.png'
import hikvision_mdfuglrd from './hikvision/mdfuglrd.png'
import dahua_hblnavdt from './dahua/hblnavdt.png'
import dahua_mu9ou2ym from './dahua/mu9ou2ym.png'
import dahua_1k6fpajz from './dahua/1k6fpajz.png'
import dahua_wdda9dgg from './dahua/wdda9dgg.png'
import dahua_kv7uj7mi from './dahua/kv7uj7mi.png'
import dahua_pyplxwm2 from './dahua/pyplxwm2.png'
import dahua_znmqqswy from './dahua/znmqqswy.png'
import dahua_ycw0o409 from './dahua/ycw0o409.png'
import dahua_spk2if6m from './dahua/spk2if6m.png'
import dahua_ajz01qkq from './dahua/ajz01qkq.png'
import dahua_g5jeybuv from './dahua/g5jeybuv.png'
import dahua_zvmw0qaf from './dahua/zvmw0qaf.png'
import dahua_7yktvjfv from './dahua/7yktvjfv.png'

export const VENDOR_PANELS = {
  hikvision: [
    { names: ['Hikvision'], img: hikvision_vdaaeu6f, uSize: 2, w: 6153, h: 1226 },
    { names: ['vision'], img: hikvision_nmmp5fm3, uSize: 5, w: 3227, h: 1461 },
    { names: ['2盘位'], img: hikvision_okk0m2vm, uSize: 1, w: 3497, h: 351 },
    { names: ['4U高-型号未知后续补充'], img: hikvision_vcdpa8nx, uSize: 4, w: 3497, h: 1401 },
    { names: ['DS-VE22S-B'], img: hikvision_fam3710u, uSize: 2, w: 3497, h: 701 },
    { names: ['HIKVISION 10路'], img: hikvision_xuic9lzr, uSize: 2, w: 3497, h: 701 },
    { names: ['海康 16路'], img: hikvision_evbjn6ar, uSize: 2, w: 3497, h: 701 },
    { names: ['硬盘录像机'], img: hikvision_if6qmfth, uSize: 1, w: 3497, h: 351 },
    { names: ['IVMS-3000C'], img: hikvision_xixa1tg6, uSize: 4, w: 3497, h: 1401 },
    { names: ['DS-A72036RH-LCVS'], img: hikvision_bokt6nit, uSize: 4, w: 3497, h: 1401 },
    { names: ['DS-VE22S-B（2）'], img: hikvision_frecdoeh, uSize: 1, w: 3497, h: 351 },
    { names: ['DS-6104HC-SATA'], img: hikvision_vcbc97j9, uSize: 2, w: 3503, h: 703 },
    { names: ['DS-A908RE-B'], img: hikvision_itegr1n2, uSize: 3, w: 3497, h: 1051 },
    { names: ['CCTV video recorder'], img: hikvision_omadsmyp, uSize: 1, w: 3497, h: 351 },
    { names: ['DS-3E0326P-S'], img: hikvision_3rufuylc, uSize: 1, w: 3497, h: 351 },
    { names: ['DS-VM21S-B'], img: hikvision_ubvkbawp, uSize: 2, w: 3497, h: 703 },
    { names: ['DS-3E3728-H'], img: hikvision_bhnl1hsa, uSize: 1, w: 3499, h: 353 },
    { names: ['DS-96128N-I24'], img: hikvision_ux4kjweq, uSize: 4, w: 3497, h: 1401 },
    { names: ['海康威视HIKVISION'], img: hikvision_x3hanriy, uSize: 1, w: 3499, h: 353 },
    { names: ['海康智能存储DS-96016NX'], img: hikvision_ayav9hnc, uSize: 4, w: 3497, h: 1053 },
    { names: ['DS-VE2S-XB'], img: hikvision_5bpeof7u, uSize: 2, w: 3497, h: 701 },
    { names: ['HIKVISION-DS-A71072R'], img: hikvision_bphgkwii, uSize: 8, w: 3497, h: 2801 },
    { names: ['HIKVISION-1'], img: hikvision_exyjgsgk, uSize: 3, w: 3499, h: 1053 },
    { names: ['HIKVISION-2'], img: hikvision_ma3hulqu, uSize: 1, w: 3229, h: 329 },
    { names: ['DS-A82048D'], img: hikvision_dtimecob, uSize: 4, w: 3497, h: 1401 },
    { names: ['DS-CD22D-BHW6PP'], img: hikvision_4wzxihwh, uSize: 2, w: 3497, h: 686 },
    { names: ['DS-IE1064-03UBA'], img: hikvision_vwtbudru, uSize: 1, w: 3497, h: 351 },
    { names: ['DS-IX2003-A3UX'], img: hikvision_lxcqrszy, uSize: 2, w: 3497, h: 686 },
    { names: ['海康24硬盘位录像机'], img: hikvision_n9xqtndl, uSize: 4, w: 3497, h: 1401 },
    { names: ['海康录像机'], img: hikvision_zdfarvrr, uSize: 2, w: 3497, h: 703 },
    { names: ['海康威视录像机'], img: hikvision_qurfzlvn, uSize: 4, w: 3497, h: 1401 },
    { names: ['海康威视NVR网络录像机'], img: hikvision_cltzpjc1, uSize: 1, w: 3497, h: 351 },
    { names: ['海康威视超脑硬盘录像机'], img: hikvision_arobgnor, uSize: 2, w: 3497, h: 701 },
    { names: ['DS-9632NI-M8R'], img: hikvision_9a09kw6b, uSize: 2, w: 3497, h: 701 },
    { names: ['Hikvision DS-3T1510HP V2'], img: hikvision_uhyese1c, uSize: 1, w: 3497, h: 351 },
    { names: ['DS-A82048D（8U）'], img: hikvision_ekclglpr, uSize: 8, w: 3497, h: 2801 },
    { names: ['海康威视'], img: hikvision_9egzq1fn, uSize: 2, w: 3497, h: 701 },
    { names: ['海康威视-视频上云流媒体服务器', '海康威视-视频上云管理服务器'], img: hikvision_m4togelj, uSize: 2, w: 3497, h: 701 },
    { names: ['HIKVISION硬盘录像机'], img: hikvision_s3fwb150, uSize: 2, w: 3497, h: 701 },
    { names: ['海康硬盘录像机'], img: hikvision_rerfrpuu, uSize: 1, w: 3497, h: 351 },
    { names: ['海康 DS-3E3728-HL'], img: hikvision_mdfuglrd, uSize: 1, w: 3497, h: 351 }
  ],
  dahua: [
    { names: ['16盘位'], img: dahua_hblnavdt, uSize: 3, w: 3497, h: 1051 },
    { names: ['DH-DSS-H8900S3'], img: dahua_mu9ou2ym, uSize: 1, w: 3497, h: 351 },
    { names: ['DH-EVS5024S-R'], img: dahua_1k6fpajz, uSize: 4, w: 3499, h: 1403 },
    { names: ['大华硬盘录像机'], img: dahua_wdda9dgg, uSize: 2, w: 3497, h: 701 },
    { names: ['大华 磁盘阵列'], img: dahua_kv7uj7mi, uSize: 6, w: 3497, h: 2101 },
    { names: ['系统服务器'], img: dahua_pyplxwm2, uSize: 3, w: 3497, h: 1051 },
    { names: ['高清解码器'], img: dahua_znmqqswy, uSize: 2, w: 3497, h: 701 },
    { names: ['全程监控推流网关'], img: dahua_ycw0o409, uSize: 3, w: 3497, h: 1051 },
    { names: ['大华服务器 云存储服务器'], img: dahua_spk2if6m, uSize: 2, w: 3499, h: 701 },
    { names: ['大华 DH-DTP-9110D-B'], img: dahua_ajz01qkq, uSize: 1, w: 3497, h: 351 },
    { names: ['DH-CSS8148S-10GIR'], img: dahua_g5jeybuv, uSize: 6, w: 3497, h: 2101 },
    { names: ['大华录像机'], img: dahua_zvmw0qaf, uSize: 3, w: 3497, h: 1051 },
    { names: ['DH-S6600-24XF2QF-A'], img: dahua_7yktvjfv, uSize: 1, w: 3497, h: 351 }
  ]
}

/** 厂商别名 → 注册表组 */
const VENDOR_GROUP_ALIASES = {
  hikvision: ['海康', 'hikvision', 'hik'],
  dahua: ['大华', 'dahua', 'dh-'],
}

/** 规范化型号名：小写、去空格/点/横杠/下划线、全角转半角 */
function normalizeModel(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s._\-（）()]/g, '')
}

/** 匹配设备型号 → 面板图源条目（无匹配返回 null） */
export function matchVendorPanel(device) {
  const model = device?.model || ''
  if (!model) return null
  const vendorRaw = String(device?.vendor || device?.brand || '').toLowerCase()

  // 1) 按厂商别名缩小匹配范围；无法识别厂商时查全部
  const groups = []
  if (vendorRaw) {
    if (VENDOR_GROUP_ALIASES.hikvision.some(a => vendorRaw.includes(a))) groups.push('hikvision')
    if (VENDOR_GROUP_ALIASES.dahua.some(a => vendorRaw.includes(a))) groups.push('dahua')
  }
  const scan = groups.length ? groups : ['hikvision', 'dahua']

  const nModel = normalizeModel(model)
  if (!nModel) return null

  // 2) 先精确匹配，再双向包含匹配
  for (const g of scan) {
    for (const entry of VENDOR_PANELS[g]) {
      for (const name of entry.names) {
        if (normalizeModel(name) === nModel) return entry
      }
    }
  }
  for (const g of scan) {
    for (const entry of VENDOR_PANELS[g]) {
      for (const name of entry.names) {
        const n = normalizeModel(name)
        if (n.length >= 3 && (nModel.includes(n) || n.includes(nModel))) return entry
      }
    }
  }
  return null
}
