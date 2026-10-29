/**
 * 全品牌网络设备型号库 v3.0
 * 覆盖国内外主流厂商的交换机、路由器、防火墙、服务器、网关、AC等设备
 */
export default {
  // ==================== 国产品牌 ====================

  '华为': {
    switch: [
      'S1730S-L8T-A','S1730S-L16R-A','S1730S-L24T-A','S1730S-L24P-A','S1730S-L8T-A1','S1730S-L24TR-A',
      'S2720-EI','S2720-SI','S2750-EI','S2751-EI',
      'S3700-SI','S3700-EI','S3730-SI','S3730-EI',
      'S5700-LI','S5700-SI','S5700-EI','S5700-HI',
      'S5720-SI','S5720-EI','S5720-HI','S5720-LI','S5720S-SI','S5720S-LI',
      'S5730-SI','S5730-HI','S5730S-EI',
      'S5731-S','S5731-H','S5731S-S','S5731S-H',
      'S5732-H','S5735-L24T4X-A','S5735-L24P4X-A','S5735-L48T4X-A','S5735-L48P4X-A',
      'S5735S-L24T4X-A','S5735S-L48T4X-A','S5735S-S24T4X-A','S5735S-S48T4X-A',
      'S5736-S','S6730-S','S6730-H','S6730S-S','S6730S-H',
      'S7703','S7706','S7710','S7712',
      'S9703','S9706','S9712',
      'S12700E-4','S12700E-8','S12700E-12',
      'CloudEngine 5800','CloudEngine 6800','CloudEngine 7800','CloudEngine 8800',
      'CloudEngine 9800','CloudEngine 12800','CloudEngine 16800'
    ],
    router: [
      'AR1220-S','AR1220E','AR1220E-S','AR1220F','AR1610-X6','AR161W',
      'AR2200-S','AR2220-S','AR2240-S','AR2240C-S',
      'AR3200-S','AR3260-S','AR3670',
      'AR6100','AR6140-16G4XG','AR6140E-9G-2AC',
      'AR6300','AR6280','AR651W','AR651F-Lite',
      'NE20E-S','NE40E','NE80E','NE5000E',
      'NetEngine 8000 M8','NetEngine 8000 M14',
      'AR6700L','AR6700H','AR8700'
    ],
    firewall: [
      'USG6310E-S','USG6330E-S','USG6350E-S','USG6360E-S','USG6370E-S',
      'USG6380E-S','USG6390E-S','USG6500E-S','USG6510E-S','USG6550E-S','USG6570E-S',
      'USG6600E-S','USG6620E-S','USG6630E-S','USG6650E-S','USG6680E-S',
      'USG6700E-S','USG6710E-S','USG6712E-S',
      'HiSecEngine USG6000E','HiSecEngine USG6500E','HiSecEngine USG6600E',
      'HiSecEngine USG12000','HiSecEngine AI防火墙'
    ],
    wireless: [
      'AP4050DN','AP4050DN-E','AP4050DN-S','AP4051TN',
      'AP5030DN','AP5050DN','AP6050DN','AP6052DN',
      'AP7050DE','AP7052DE','AP7060DN','AP8050DN','AP8150DN',
      'AirEngine 5760-10','AirEngine 5760-22W','AirEngine 6760-X1','AirEngine 8760-X1',
      'AC6505','AC6508','AC6605','AC6805','AC6800V',
      'WAC380-60','WAC380-120'
    ],
    server: ['TaiShan 200','TaiShan 400','FusionServer 2288H V6','FusionServer 2488H V6'],
    storage: ['OceanStor 18000','OceanStor 5800 V5','OceanStor 6800 V5','OceanStor Dorado 8000'],
    gateway: ['AR650','AR651','AR1200','EGW1500'],
    ac: ['AC6505','AC6508','AC6605','AC6805']
  },

  '华三(H3C)': {
    switch: [
      'S1850-28P','S1850-52P','S1850-28P-HPWR',
      'S5120-28P-SI','S5120-52P-SI','S5120-28P-EI','S5120-48P-EI',
      'S5130S-28P-EI','S5130S-52P-EI','S5130S-28S-EI','S5130S-52S-EI',
      'S5500V2-SI','S5500V2-EI','S5500V3-28S','S5500V3-54S',
      'S5560X-EI','S5560X-HI','S5560S-EI','S5560S-SI',
      'S5590-28S','S5590-48S',
      'S5600V3','S5800V3','S5820V3','S5830V3',
      'S6520X-EI','S6520X-HI','S6520X-SI',
      'S6800-4C','S6800-32Q','S6800-54QS',
      'S7500E-X','S7500X','S7600',
      'S10500X','S12500X',
      'MS4100','MS4100V2','MS4300','MS4320','MS4500'
    ],
    router: [
      'MSR36-20','MSR36-40','MSR36-60','MSR3660',
      'MSR56-60','MSR56-80',
      'SR6602','SR6604','SR6608','SR6616',
      'SR8804-X','SR8808-X','SR8812-X',
      'CR16000-F','CR19000',
      'ER3200G3','ER3260G3','ER5200G3','ER8300G2'
    ],
    firewall: [
      'F1000-AK','F1000-C','F1000-E','F1000-S',
      'F1000-AK115','F1000-AK120','F1000-AK125','F1000-AK130','F1000-AK135',
      'F1000-AK150','F1000-AK160','F1000-AK170','F1000-AK180',
      'F5000-AK','F5000-C',
      'SecPath F1000-AK','SecPath F1000-E','SecPath F5000-AK',
      'SecPath T1000-AK','SecPath T5000-S'
    ],
    wireless: [
      'WA6320','WA6330','WA6338','WA6628','WA6638',
      'WX3010','WX3024','WX3510H','WX3540H','WX5510H','WX5540H','WX6108'
    ],
    server: ['UniServer R4900 G5','UniServer R4700 G5','UniServer R6900 G5'],
    gateway: ['ERG2-1350W','MSR2600','MSR2630'],
    ac: ['WX3010','WX3024','WX3510H','WX5510H']
  },

  '锐捷(Ruijie)': {
    switch: [
      'RG-S2910-24GT4XS-E','RG-S2910-48GT4XS-E',
      'RG-S2928G-E','RG-S2952G-E',
      'RG-S5310-24GT4XS','RG-S5310-48GT4XS',
      'RG-S5750C-28GT4XS-H','RG-S5750C-48GT4XS-H',
      'RG-S5760C-24GT8XS-X','RG-S5760C-48GT8XS-X',
      'RG-S6120-20XS4VS2QXS','RG-S6220-48XS6QXS-H',
      'RG-S7805E','RG-S7808E','RG-S7810E',
      'RG-N18000-X','RG-S8605E','RG-S8610E',
      'RG-ES205GC','RG-ES210GC','RG-ES218GC','RG-ES226GC',
      'RG-NBS3100-24GT4SFP','RG-NBS3200-24GT4XS'
    ],
    router: [
      'RG-RSR20-X-28','RG-RSR30-X','RG-RSR50-X','RG-RSR7708-X','RG-RSR7716-X',
      'RG-EG105G','RG-EG205G','RG-EG210G-P','RG-EG3210','RG-EG3220','RG-EG3230',
      'RG-RSR10-X-07','RG-RSR20-14E'
    ],
    firewall: [
      'RG-WALL 1600','RG-WALL 1600E','RG-WALL 3200','RG-WALL 6600',
      'RG-WALL V50','RG-WALL V100','RG-WALL V200',
      'RG-ISIEM','RG-BDS','RG-DDP'
    ],
    wireless: [
      'RG-AP720-I','RG-AP730-TR','RG-AP820-AR','RG-AP840-I',
      'RG-AP850-I','RG-AP860-I',
      'RG-WS6008','RG-WS6108','RG-WS6812','RG-WS6816',
      'RG-MAP752','RG-MAP852'
    ],
    server: ['RG-RCD1000','RG-RCD6000'],
    gateway: ['RG-EG105G','RG-EG205G','RG-EG3210'],
    ac: ['RG-WS6008','RG-WS6108','RG-WS6812']
  },

  '中兴(ZTE)': {
    switch: [
      'ZXR10 5250-28TC','ZXR10 5250-52TC','ZXR10 5250-28PM','ZXR10 5250-52PM',
      'ZXR10 5950-28TM','ZXR10 5950-52TM','ZXR10 5950-60TM',
      'ZXR10 5960-32DL','ZXR10 5960-64DL',
      'ZXR10 8905E','ZXR10 8908E','ZXR10 8912E',
      'ZXR10 9904-S','ZXR10 9908-S',
      'ZXR10 5260-28PD','ZXR10 5260-52PD'
    ],
    router: [
      'ZXR10 1800-2S','ZXR10 2800-4','ZXR10 3800-8',
      'ZXR10 M6000-8S','ZXR10 M6000-16S',
      'ZXR10 T8000'
    ],
    firewall: ['ZXSEC US6600','ZXSEC US6800','ZXSEC US6900'],
    wireless: ['ZXR10 W908','ZXR10 W915','ZXR10 W980'],
    server: ['R5300 G4','R5500 G5','R8500 G5'],
    gateway: [],
    ac: ['ZXR10 W908']
  },

  '迈普(Maipu)': {
    switch: [
      'SM3320-28TC-AC','SM3320-52TC-AC','SM4320-28TC-AC','SM4320-52TC-AC',
      'SM6700-48XF','SM6800-08','SM8900-04'
    ],
    router: ['RM1800-20','RM1800-40','RM3800E','RM7600'],
    firewall: ['MSG4000-AK','MSG6000-AK'],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  '烽火(FiberHome)': {
    switch: ['S5500-28T-AC','S5500-52T-AC','S5800-28T-AC','S6800-32CQ'],
    router: ['R8000'],
    firewall: [],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  '博达(BDCOM)': {
    switch: ['S2528','S2552','S3528','S3552','S3928','S3956','S6808'],
    router: ['R3806','R4808'],
    firewall: [],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  '神码(DCN)': {
    switch: ['DCRS-5750-28T','DCRS-5750-52T','DCRS-5950-28T','DCRS-5980'],
    router: ['DCR-2855','DCR-3680'],
    firewall: ['DCFW-1800E','DCFW-4000'],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  '迪普(DPtech)': {
    switch: ['LSW3600-24GT4GP','LSW5602-16GT8GC','LSW6600-08'],
    router: [],
    firewall: ['FW1000-GA','FW1000-GC','FW1000-GE','FW1000-GM'],
    wireless: [],
    server: [],
    gateway: ['ADX3000','ADX6000'],
    ac: []
  },

  '深信服(Sangfor)': {
    switch: [],
    router: [],
    firewall: ['AF-1000','AF-1200','AF-1300','AF-1500','AF-1800','AF-2000','SIP-1000'],
    wireless: [],
    server: ['aServer-1000','aServer-2000'],
    gateway: ['SSL VPN-1000','SSL VPN-2000','WOC-1000'],
    ac: []
  },

  '山石网科(Hillstone)': {
    switch: [],
    router: [],
    firewall: ['SG-6000-E1700','SG-6000-E2300','SG-6000-E2800','SG-6000-E3660',
      'SG-6000-E3960','SG-6000-E5260','SG-6000-E5760','SG-6000-X7180'],
    wireless: [],
    server: [],
    gateway: ['CloudEdge','CloudHive'],
    ac: []
  },

  '天融信(TopSec)': {
    switch: [],
    router: [],
    firewall: ['NGFW4000-UF','NGFW4000-TG','NGFW4000-NG','TopIDP'],
    wireless: [],
    server: [],
    gateway: ['TopVPN 6000','TopGate 500'],
    ac: []
  },

  '浪潮(Inspur)': {
    switch: ['Inspur CN12700','Inspur CN12900'],
    router: [],
    firewall: [],
    wireless: [],
    server: ['NF5280M6','NF5280M7','NF8480M6','NF8260M6','NF5180M6'],
    gateway: [],
    ac: []
  },

  '联想(Lenovo)': {
    switch: ['Lenovo CE0128T','Lenovo CE0152T','Lenovo NE1032','Lenovo NE1072T'],
    router: [],
    firewall: [],
    wireless: [],
    server: ['ThinkSystem SR650 V3','ThinkSystem SR850 V3','ThinkSystem SR950 V3'],
    gateway: [],
    ac: []
  },

  'G-COM(新格林耐特)': {
    switch: ['S2600-28TC-AC','S2600-28TC-DC','S2600-52TC-AC',
      'S2500-28TC-AC','S2500-52TC-AC','S2900-28TC-AC','S2800-28TC-AC'],
    router: [],
    firewall: [],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  '奇安信': {
    switch: [],
    router: [],
    firewall: ['NSG3000','NSG5000','NSG7000','NSG9000'],
    wireless: [],
    server: [],
    gateway: ['SSLVPN-6000','SDP-8000'],
    ac: []
  },

  // ==================== 国际品牌 ====================

  '思科(Cisco)': {
    switch: [
      'Catalyst 1000-24T-4G-L','Catalyst 1000-48T-4G-L',
      'Catalyst 2960X-24TS-L','Catalyst 2960X-48TS-L',
      'Catalyst 9200-24T','Catalyst 9200-48T','Catalyst 9200L-24T-4G',
      'Catalyst 9300-24T','Catalyst 9300-48T','Catalyst 9300L-24T-4G',
      'Catalyst 9400','Catalyst 9500-24Q','Catalyst 9500-48Y4C',
      'Catalyst 9600',
      'Nexus 9000 C93180YC-FX3','Nexus 9000 C9336C-FX2','Nexus 9000 C9504',
      'Nexus 3000 C31108PC-V','Nexus 3000 C3132Q-V',
      'Cisco MDS 9148T','Cisco MDS 9396T',
      'Meraki MS120-24P','Meraki MS225-48LP','Meraki MS250-24P','Meraki MS350-24X'
    ],
    router: [
      'ISR 1100-4P','ISR 1100-8P','ISR 4321','ISR 4331','ISR 4431','ISR 4451',
      'ISR 4461','C8500-12X4QC','C8500L-8S4X',
      'ASR 1001-X','ASR 1002-X','ASR 1006-X','ASR 9001',
      'NCS 5501-SE','NCS 560-4','NCS 5700',
      'Meraki MX68','Meraki MX84','Meraki MX100','Meraki MX250','Meraki MX450'
    ],
    firewall: [
      'ASA 5506-X','ASA 5508-X','ASA 5516-X','ASA 5525-X','ASA 5545-X','ASA 5555-X',
      'Firepower 1010','Firepower 1120','Firepower 1140','Firepower 1150',
      'Firepower 2110','Firepower 2120','Firepower 2130','Firepower 2140',
      'Firepower 4110','Firepower 4115','Firepower 4125','Firepower 4145',
      'Firepower 9300'
    ],
    wireless: [
      'Aironet 1815i','Aironet 1832i','Aironet 2802i','Aironet 3802i',
      'Catalyst 9105AXI','Catalyst 9120AXI','Catalyst 9130AXI',
      'WLC 3504','WLC 5520','WLC 8540',
      'Meraki MR36','Meraki MR46','Meraki MR56'
    ],
    server: ['UCS C220 M6','UCS C240 M6','UCS C480 M5'],
    gateway: ['Meraki MX68','Meraki MX84','Meraki MX100'],
    ac: ['WLC 3504','WLC 5520','WLC 8540']
  },

  'Juniper': {
    switch: [
      'EX2300-24T','EX2300-48T','EX3400-24T','EX3400-48T',
      'EX4100-24T','EX4100-48T','EX4300-24T','EX4300-48T',
      'EX4400-24T','EX4400-48T','EX4650-48Y',
      'QFX5100-48S','QFX5110-48S','QFX5120-48Y','QFX5200-32C','QFX10002'
    ],
    router: [
      'SRX300','SRX320','SRX340','SRX345','SRX380',
      'SRX1500','SRX4100','SRX4200','SRX4600','SRX5400','SRX5600','SRX5800',
      'MX204','MX240','MX480','MX960','MX10004','MX10008',
      'PTX1000','PTX10002','PTX10008'
    ],
    firewall: ['SRX300','SRX320','SRX340','SRX345','SRX380','SRX1500','SRX4100','SRX4200','SRX4600'],
    wireless: ['Mist AP43','Mist AP45','Mist AP63'],
    server: [],
    gateway: ['SRX300','SRX320','SRX340'],
    ac: []
  },

  'Arista': {
    switch: [
      '7010T','7020SR-24C2','7050SX3-48YC8','7050CX3-32S',
      '7060CX4-32S','7060DX5-32S','7280SR3-48YC8','7280CR3-96',
      '7800R3','7500R3'
    ],
    router: ['7280R3','7500R3'],
    firewall: [],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  'Aruba/HPE': {
    switch: [
      'Aruba 2930F-24G','Aruba 2930F-48G','Aruba 2930M-24G','Aruba 2930M-48G',
      'Aruba CX 6100-24G','Aruba CX 6100-48G',
      'Aruba CX 6200F-24G','Aruba CX 6200F-48G',
      'Aruba CX 6300M-24G','Aruba CX 6300M-48G',
      'Aruba CX 6400','Aruba CX 8320','Aruba CX 8325','Aruba CX 8400',
      'Aruba CX 10000',
      'HPE 1950-24G','HPE 1950-48G','HPE 5510-24G','HPE 5510-48G'
    ],
    router: ['Aruba 7005','Aruba 7008','Aruba 7010','Aruba 7030','Aruba 7205','Aruba 7240XM'],
    firewall: [],
    wireless: [
      'Aruba AP-505','Aruba AP-515','Aruba AP-535','Aruba AP-555','Aruba AP-635','Aruba AP-655'
    ],
    server: ['HPE ProLiant DL360 Gen11','HPE ProLiant DL380 Gen11','HPE ProLiant DL560 Gen11'],
    gateway: ['Aruba 7005','Aruba 7008','Aruba 7010','Aruba 9004'],
    ac: []
  },

  'Fortinet(FortiGate)': {
    switch: ['FortiSwitch 124F','FortiSwitch 148F','FortiSwitch 224E','FortiSwitch 248E',
      'FortiSwitch 424E','FortiSwitch 448E','FortiSwitch 1024E'],
    router: [],
    firewall: [
      'FortiGate 40F','FortiGate 60F','FortiGate 80F','FortiGate 100F',
      'FortiGate 200F','FortiGate 300E','FortiGate 400E','FortiGate 600E',
      'FortiGate 1100E','FortiGate 1800F','FortiGate 2600F','FortiGate 3500F',
      'FortiGate 4200F','FortiGate 7121F'
    ],
    wireless: ['FortiAP 231F','FortiAP 431F','FortiAP 831F'],
    server: [],
    gateway: ['FortiGate 40F','FortiGate 60F','FortiGate 80F'],
    ac: []
  },

  'Palo Alto Networks': {
    switch: [],
    router: [],
    firewall: [
      'PA-410','PA-440','PA-450','PA-460',
      'PA-1410','PA-1420','PA-3410','PA-3420','PA-3430',
      'PA-5410','PA-5420','PA-5430','PA-5440','PA-5450',
      'PA-7050','PA-7080',
      'VM-50','VM-100','VM-300','VM-500','VM-700'
    ],
    wireless: [],
    server: [],
    gateway: ['Prisma Access'],
    ac: []
  },

  'Dell': {
    switch: [
      'PowerSwitch S3048-ON','PowerSwitch S4048-ON','PowerSwitch S4112-ON',
      'PowerSwitch S5212F-ON','PowerSwitch S5224F-ON','PowerSwitch S5232F-ON',
      'PowerSwitch S5248F-ON','PowerSwitch S5296F-ON',
      'PowerSwitch Z9264F-ON','PowerSwitch Z9332F-ON'
    ],
    router: [],
    firewall: ['SonicWall TZ270','SonicWall TZ370','SonicWall NSa 2700','SonicWall NSa 3700'],
    wireless: [],
    server: ['PowerEdge R250','PowerEdge R350','PowerEdge R450','PowerEdge R650',
      'PowerEdge R750','PowerEdge R750xa','PowerEdge R760','PowerEdge R960'],
    gateway: [],
    ac: []
  },

  'Extreme Networks': {
    switch: [
      'ExtremeSwitching X440-G2-24p','ExtremeSwitching X450-G2-48p',
      'ExtremeSwitching X465-24W','ExtremeSwitching X590-24x',
      'ExtremeSwitching X690-48x','ExtremeSwitching X870-32c',
      'Summit X460-G2','Summit X670-G2','Summit X770'
    ],
    router: [],
    firewall: [],
    wireless: ['Extreme AP305C','Extreme AP410C','Extreme AP460C'],
    server: [],
    gateway: [],
    ac: []
  },

  'Check Point': {
    switch: [],
    router: [],
    firewall: [
      'Quantum Spark 1530','Quantum Spark 1550','Quantum Spark 1570',
      'Quantum 3600','Quantum 3800','Quantum 6200','Quantum 6600','Quantum 6900',
      'Quantum Lightspeed','Maestro Hyperscale'
    ],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  'F5': {
    switch: [],
    router: [],
    firewall: ['BIG-IP i2600','BIG-IP i2800','BIG-IP i4600','BIG-IP i4800','BIG-IP i5800','BIG-IP i7800','BIG-IP i10800'],
    wireless: [],
    server: [],
    gateway: ['BIG-IP LTM','BIG-IP APM','BIG-IP ASM','BIG-IP AFM'],
    ac: []
  },

  'Netgear': {
    switch: [
      'GS108Tv3','GS110TPP','GS116E','GS724Tv4','GS728TPP','GS748Tv5',
      'MS510TXUP','MS108EUP','XS716T','XS724T','XS728T',
      'M4250-40G8XF-PoE+','M4300-28G','M4300-52G'
    ],
    router: ['BR200','BR500','PR60X','PR460X'],
    firewall: [],
    wireless: ['WAX610','WAX620','WAX630','WAX638'],
    server: [],
    gateway: ['Orbi Pro SXK80','Orbi Pro SXK30'],
    ac: []
  },

  'Ubiquiti(UniFi)': {
    switch: [
      'USW-Lite-8-PoE','USW-Lite-16-PoE','USW-24-PoE','USW-48-PoE',
      'USW-Pro-24-PoE','USW-Pro-48-PoE','USW-Enterprise-24-PoE','USW-Enterprise-48-PoE',
      'USW-EnterpriseXG-24','USW-Aggregation','USW-Pro-Aggregation'
    ],
    router: ['UXG-Lite','UXG-Pro','UDM-Pro','UDM-SE','UDW-Enterprise'],
    firewall: [],
    wireless: ['UAP-AC-Lite','UAP-AC-Pro','U6-Lite','U6-Pro','U6-LR','U6-Enterprise','U7-Pro'],
    server: [],
    gateway: ['UDM-Pro','UDM-SE','UXG-Pro','CloudKey Gen2+'],
    ac: []
  },

  'MikroTik': {
    switch: [
      'CRS112-8G-4S-IN','CRS312-4C+8XG-RM','CRS326-24G-2S+RM','CRS328-24P-4S+RM',
      'CRS354-48G-4S+2Q+RM','CRS504-4XQ-IN','CRS518-16XS-2XQ-RM'
    ],
    router: [
      'RB3011UiAS-RM','RB4011iGS+RM','RB5009UG+S+IN',
      'CCR1009-7G-1C-1S+','CCR1016-12G','CCR1036-8G-2S+','CCR1072-1G-8S+','CCR2004-16G-2S+',
      'hEX S','hAP ax2','hAP ax3','Chateau 5G'
    ],
    firewall: [],
    wireless: ['cAP ac','cAP ax','wAP ac','OmniTIK 5 ac'],
    server: [],
    gateway: ['RB5009UG+S+IN','CCR1009','CCR2004'],
    ac: []
  },

  'D-Link': {
    switch: [
      'DGS-1100-05','DGS-1100-08','DGS-1100-24','DGS-1210-28','DGS-1210-52',
      'DGS-1510-28X','DGS-1510-52X','DGS-3130-30TS','DGS-3630-28SC'
    ],
    router: ['DSR-250N','DSR-500N','DSR-1000AC'],
    firewall: ['DFL-260E','DFL-860E','DFL-2560G'],
    wireless: ['DAP-2610','DAP-2662','DAP-2680','DAP-3666','DWL-8620AP'],
    server: [],
    gateway: [],
    ac: []
  },

  'Allied Telesis': {
    switch: [
      'AT-x230-10GP','AT-x510-28GSX','AT-x530-28GPX','AT-x550-18XTQ',
      'AT-x930-28GPX','AT-x950-52XTQm'
    ],
    router: ['AT-AR3050S','AT-AR4050S'],
    firewall: ['AT-AR4050S-02'],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  'Ruckus(Commscope)': {
    switch: ['ICX 7150-24P','ICX 7150-48P','ICX 7550-24P','ICX 7550-48P','ICX 7850-48FS'],
    router: [],
    firewall: [],
    wireless: ['R650','R750','R850','R770','T750','H550'],
    server: [],
    gateway: ['Ruckus Cloudpath','SmartZone 100','SmartZone 300'],
    ac: []
  },

  'TP-Link': {
    switch: [
      'TL-SG108E','TL-SG108PE','TL-SG1024DE','TL-SG3428','TL-SG3452',
      'TL-SG3210','TL-SG3218','TL-SG3226','TL-SX3008F','TL-SX3016F',
      'JetStream T1500G-10MPS','JetStream T1600G-28TS','JetStream T1700G-28TQ',
      'JetStream T2600G-28TS','JetStream T2600G-52TS','JetStream T2700G-28TQ'
    ],
    router: ['TL-R470T+','TL-R480T+','TL-R600VPN','TL-ER5120','TL-ER6120','TL-ER7206'],
    firewall: [],
    wireless: ['EAP225','EAP245','EAP265 HD','EAP660 HD','EAP670','EAP783'],
    server: [],
    gateway: ['TL-ER5120','TL-ER6120','TL-ER7206'],
    ac: ['OC200','OC300']
  },

  '派网(Panabit)': {
    switch: [],
    router: [],
    firewall: [
      'PB-1000','PB-2000','PB-3000','PB-5000','PB-7000','PB-10000',
      'Panalog-100','Panalog-200','Panalog-500'
    ],
    wireless: [],
    server: [],
    gateway: ['PB-1000','PB-2000','PB-3000','PB-5000','Panabit智能应用网关'],
    ac: []
  },

  '网御星云(Leadsec)': {
    switch: [],
    router: [],
    firewall: ['Power V-6000','Power V-7000','Leadsec-6000'],
    wireless: [],
    server: [],
    gateway: ['Leadsec-6000-AK'],
    ac: []
  },

  'SonicWall': {
    switch: [],
    router: [],
    firewall: [
      'TZ270','TZ370','TZ470','TZ570','TZ670',
      'NSa 2700','NSa 3700','NSa 4700','NSa 5700','NSa 6700',
      'NSsp 13700','NSsp 15700'
    ],
    wireless: ['SonicWave 231c','SonicWave 432e','SonicWave 641'],
    server: [],
    gateway: [],
    ac: []
  },

  'WatchGuard': {
    switch: [],
    router: [],
    firewall: [
      'Firebox T20','Firebox T40','Firebox T80',
      'Firebox M290','Firebox M390','Firebox M590','Firebox M690',
      'Firebox M4800','Firebox M5800'
    ],
    wireless: [],
    server: [],
    gateway: [],
    ac: []
  },

  'Barracuda': {
    switch: [],
    router: [],
    firewall: ['CloudGen F18','F80','F180','F280','F380','F480','F800','F900'],
    wireless: [],
    server: [],
    gateway: ['Barracuda Web Security Gateway','Barracuda Email Security Gateway'],
    ac: []
  },

  'Sophos': {
    switch: [],
    router: [],
    firewall: [
      'XGS 87','XGS 107','XGS 116','XGS 126','XGS 136',
      'XGS 2100','XGS 2300','XGS 3100','XGS 3300','XGS 4300','XGS 4500',
      'XGS 5500','XGS 6500','XGS 7500'
    ],
    wireless: ['APX 120','APX 320','APX 530','APX 740'],
    server: [],
    gateway: ['SG 105','SG 115','SG 125','SG 135'],
    ac: []
  },

  '新华三(New H3C)': {
    switch: [],
    router: [],
    firewall: ['SecPath F1000-AK','SecPath F5000-S'],
    wireless: [],
    server: ['UniServer R4900 G7','UniServer R6900 G7'],
    gateway: [],
    ac: []
  },
}
