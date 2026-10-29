/**
 * ==================== 网络设备 CLI 命令库 ====================
 * 移植自「网络设备仿真实验室」的命令系统，应用于 SSH 终端：
 *  1. 命令大全（CMD_LIB）：华为/H3C/思科/锐捷 4 厂商，含中文解释与配置模板
 *  2. 前缀联想引擎（matchSuggestions）：输入一个词联想下一词，支持真实设备简写习惯
 *     例：sys → system-view   dis ver → display version   int → interface
 *
 * 联想条目 cmd 中的 <参数> 为占位符，不参与严格前缀匹配（参数自由输入）。
 */

// ============ 联想命令表（按厂商） ============
// 结构：{ cmd, desc, usage } —— cmd 含 <参数> 占位；desc 为中文解释；usage 为简写提示
const SUGGEST_LIB = {
  huawei: [
    // ---- 用户视图 ----
    { cmd: 'system-view', desc: '进入系统视图（配置模式）', usage: '可简写 sys' },
    { cmd: 'display version', desc: '版本、运行时长', usage: 'dis ver' },
    { cmd: 'display current-configuration', desc: '当前配置', usage: 'dis cur' },
    { cmd: 'display saved-configuration', desc: '已保存配置', usage: 'dis sav' },
    { cmd: 'display device', desc: '单板状态', usage: 'dis dev' },
    { cmd: 'display interface brief', desc: '接口状态摘要', usage: 'dis int b' },
    { cmd: 'display ip interface brief', desc: '三层接口 IP 状态', usage: 'dis ip int b' },
    { cmd: 'display vlan', desc: 'VLAN 列表', usage: 'dis vl' },
    { cmd: 'display mac-address', desc: 'MAC 地址表', usage: 'dis mac' },
    { cmd: 'display arp all', desc: 'ARP 表', usage: 'dis a' },
    { cmd: 'display ip routing-table', desc: '路由表', usage: 'dis ip r' },
    { cmd: 'display eth-trunk <id>', desc: '聚合口状态', usage: 'dis eth' },
    { cmd: 'display stp brief', desc: '生成树', usage: 'dis stp' },
    { cmd: 'display transceiver interface <端口>', desc: '光模块信息', usage: 'dis tr' },
    { cmd: 'display cpu-usage', desc: 'CPU 使用率', usage: 'dis cpu' },
    { cmd: 'display memory-usage', desc: '内存使用率', usage: 'dis mem' },
    { cmd: 'display temperature', desc: '温度', usage: 'dis temp' },
    { cmd: 'display logbuffer', desc: '日志缓冲', usage: 'dis log' },
    { cmd: 'display alarm active', desc: '活动告警', usage: 'dis al' },
    { cmd: 'ping <IP>', desc: '测试连通性', usage: 'ping 192.168.1.1' },
    { cmd: 'tracert <IP>', desc: '路由跟踪', usage: 'trac' },
    { cmd: 'save', desc: '保存配置（确认 y）', usage: '' },
    // ---- 系统视图 ----
    { cmd: 'sysname <名称>', desc: '修改设备名称', usage: 'sysn' },
    { cmd: 'undo sysname', desc: '恢复默认设备名称', usage: 'un sysn' },
    { cmd: 'vlan batch <id列表>', desc: '批量创建 VLAN', usage: 'vlan b 100 200' },
    { cmd: 'vlan <id>', desc: '创建 VLAN / 进入 VLAN 视图', usage: '' },
    { cmd: 'interface <端口名>', desc: '进入接口视图', usage: 'int g0/0/1' },
    { cmd: 'interface Eth-Trunk <id>', desc: '进入聚合口视图', usage: 'int eth 1' },
    { cmd: 'interface Vlanif <id>', desc: '进入 VLAN 三层接口视图', usage: 'int vl 100' },
    { cmd: 'ip route-static <网段> <掩码> <下一跳>', desc: '添加静态路由', usage: 'ip rout 10.0.0.0 16 10.1.1.2' },
    { cmd: 'undo ip route-static <网段> <掩码> <下一跳>', desc: '删除静态路由', usage: 'un ip rout' },
    { cmd: 'ospf <id> router-id <rid>', desc: '启用 OSPF', usage: 'ospf 1' },
    { cmd: 'acl <编号>', desc: '创建 ACL（3000 为扩展）', usage: 'acl 3000' },
    { cmd: 'rule <id> permit ip source <网段> <反掩码>', desc: 'ACL 规则：允许', usage: 'rule 5 permit ip' },
    { cmd: 'traffic-filter inbound acl <编号>', desc: '接口应用 ACL（入向）', usage: '' },
    { cmd: 'snmp-agent', desc: '启用 SNMP', usage: '' },
    { cmd: 'snmp-agent community read cipher <密文>', desc: 'SNMP 读团体字', usage: '' },
    { cmd: 'snmp-agent sys-info version v2c', desc: 'SNMP 版本', usage: '' },
    { cmd: 'ntp-service unicast-server <IP>', desc: 'NTP 服务器', usage: 'ntp-s un' },
    { cmd: 'stelnet server enable', desc: '启用 SSH 服务', usage: '' },
    { cmd: 'user-interface vty 0 4', desc: '进入 VTY 视图', usage: '' },
    // ---- 接口视图 ----
    { cmd: 'ip address <IP> <掩码>', desc: '配置接口 IP', usage: 'ip add 192.168.1.1 24' },
    { cmd: 'undo ip address', desc: '清除接口 IP', usage: 'un ip add' },
    { cmd: 'description <描述>', desc: '接口描述', usage: 'desc' },
    { cmd: 'port link-type <access|trunk>', desc: '端口模式', usage: 'p lin' },
    { cmd: 'port default vlan <id>', desc: 'Access 口划入 VLAN', usage: 'p d v 100' },
    { cmd: 'port trunk allow-pass vlan <列表>', desc: 'Trunk 放行 VLAN', usage: 'p t a v 100 200' },
    { cmd: 'port trunk pvid vlan <id>', desc: '修改 Trunk PVID', usage: '' },
    { cmd: 'shutdown', desc: '关闭端口', usage: 'sh' },
    { cmd: 'undo shutdown', desc: '开启端口', usage: 'un sh' },
    { cmd: 'speed <auto|100|1000>', desc: '端口速率', usage: '' },
    { cmd: 'duplex <full|half|auto>', desc: '双工模式', usage: '' },
    { cmd: 'stp edged-port enable', desc: '生成树边缘端口', usage: '' },
    { cmd: 'eth-trunk <id>', desc: '加入聚合口', usage: '' },
    { cmd: 'quit', desc: '退出当前视图', usage: 'q' },
    { cmd: 'return', desc: '返回用户视图', usage: 'ret' },
  ],

  h3c: [
    // ---- 用户视图 ----
    { cmd: 'system-view', desc: '进入系统视图（配置模式）', usage: '可简写 sys' },
    { cmd: 'display version', desc: '版本、启动时间、运行时长', usage: 'dis ver' },
    { cmd: 'display current-configuration', desc: '当前配置', usage: 'dis cur' },
    { cmd: 'display saved-configuration', desc: '已保存配置', usage: 'dis sav' },
    { cmd: 'display device', desc: '单板/模块状态', usage: 'dis dev' },
    { cmd: 'display device manuinfo', desc: '序列号、制造信息', usage: 'dis dev m' },
    { cmd: 'display interface brief', desc: '接口状态摘要', usage: 'dis int b' },
    { cmd: 'display ip interface brief', desc: '三层接口 IP 状态', usage: 'dis ip int b' },
    { cmd: 'display vlan', desc: 'VLAN 列表', usage: 'dis vl' },
    { cmd: 'display mac-address', desc: 'MAC 地址表', usage: 'dis mac' },
    { cmd: 'display arp', desc: 'ARP 表', usage: 'dis a' },
    { cmd: 'display ip routing-table', desc: '路由表', usage: 'dis ip r' },
    { cmd: 'display link-aggregation verbose', desc: '链路聚合详情', usage: 'dis link' },
    { cmd: 'display stp brief', desc: '生成树端口角色/状态', usage: 'dis stp' },
    { cmd: 'display transceiver interface', desc: '光模块信息（收发光功率）', usage: 'dis tr' },
    { cmd: 'display power', desc: '电源状态', usage: 'dis pow' },
    { cmd: 'display cpu-usage', desc: 'CPU 使用率', usage: 'dis cpu' },
    { cmd: 'display memory', desc: '内存使用率', usage: 'dis mem' },
    { cmd: 'display environment', desc: '温度', usage: 'dis env' },
    { cmd: 'display logbuffer', desc: '日志缓冲区', usage: 'dis log' },
    { cmd: 'ping <IP>', desc: '测试连通性', usage: '' },
    { cmd: 'tracert <IP>', desc: '路由跟踪', usage: 'trac' },
    { cmd: 'save', desc: '保存配置（确认 y）', usage: 'save force 不询问' },
    // ---- 系统视图 ----
    { cmd: 'sysname <名称>', desc: '修改设备名称', usage: 'sysn' },
    { cmd: 'undo sysname', desc: '恢复默认名称', usage: 'un sysn' },
    { cmd: 'vlan <id>', desc: '创建 VLAN', usage: '' },
    { cmd: 'interface range <端口> to <端口>', desc: '批量进入接口视图', usage: 'int r' },
    { cmd: 'interface <端口名>', desc: '进入接口视图', usage: 'int g1/0/1' },
    { cmd: 'interface Bridge-Aggregation <id>', desc: '进入聚合口视图', usage: 'int br' },
    { cmd: 'interface Vlan-interface <id>', desc: '进入 VLAN 三层接口', usage: 'int vl' },
    { cmd: 'ip route-static <网段> <掩码> <下一跳>', desc: '添加静态路由', usage: 'ip rout' },
    { cmd: 'undo ip route-static <网段> <掩码>', desc: '删除静态路由', usage: 'un ip rout' },
    { cmd: 'ospf <id> router-id <rid>', desc: '启用 OSPF', usage: 'ospf 1' },
    { cmd: 'acl number <编号>', desc: '创建 ACL', usage: 'acl n 3000' },
    { cmd: 'rule <id> permit ip source <网段> <反掩码>', desc: 'ACL 规则：允许', usage: '' },
    { cmd: 'packet-filter <编号> inbound', desc: '接口应用 ACL（入向）', usage: 'pack' },
    { cmd: 'snmp-agent', desc: '启用 SNMP', usage: '' },
    { cmd: 'snmp-agent community read <名称>', desc: 'SNMP 读团体字', usage: '' },
    { cmd: 'ntp-service unicast-server <IP>', desc: 'NTP 服务器', usage: 'ntp-s' },
    { cmd: 'ssh server enable', desc: '启用 SSH 服务', usage: '' },
    { cmd: 'public-key local create rsa', desc: '生成 RSA 密钥对', usage: '' },
    { cmd: 'local-user <用户名> class manage', desc: '创建管理用户', usage: '' },
    // ---- 接口视图 ----
    { cmd: 'ip address <IP> <掩码>', desc: '配置接口 IP', usage: 'ip add' },
    { cmd: 'undo ip address', desc: '清除接口 IP', usage: 'un ip add' },
    { cmd: 'description <描述>', desc: '接口描述', usage: 'desc' },
    { cmd: 'port link-type <access|trunk>', desc: '端口模式', usage: 'p lin' },
    { cmd: 'port access vlan <id>', desc: 'Access 口划入 VLAN', usage: 'p a v' },
    { cmd: 'port trunk permit vlan <列表|all>', desc: 'Trunk 放行 VLAN', usage: 'p t p v' },
    { cmd: 'port trunk pvid vlan <id>', desc: '修改 Trunk PVID', usage: '' },
    { cmd: 'shutdown', desc: '关闭端口', usage: 'sh' },
    { cmd: 'undo shutdown', desc: '开启端口', usage: 'un sh' },
    { cmd: 'speed <auto|100|1000>', desc: '速率', usage: '' },
    { cmd: 'duplex <auto|full>', desc: '双工', usage: '' },
    { cmd: 'broadcast-suppression <百分比>', desc: '广播风暴抑制', usage: '' },
    { cmd: 'stp edged-port enable', desc: '生成树边缘端口', usage: '' },
    { cmd: 'link-aggregation mode dynamic', desc: '聚合口 LACP 模式', usage: '' },
    { cmd: 'port link-aggregation group <id>', desc: '加入聚合组', usage: '' },
    { cmd: 'quit', desc: '退出当前视图', usage: 'q' },
    { cmd: 'return', desc: '返回用户视图', usage: 'ret' },
  ],

  cisco: [
    // ---- 特权模式 ----
    { cmd: 'configure terminal', desc: '进入配置模式', usage: '可简写 conf t' },
    { cmd: 'show version', desc: '版本、uptime、序列号', usage: 'sh ver' },
    { cmd: 'show running-config', desc: '当前配置', usage: 'sh run' },
    { cmd: 'show startup-config', desc: '启动配置', usage: 'sh start' },
    { cmd: 'show interfaces status', desc: '接口状态摘要（交换机）', usage: 'sh int s' },
    { cmd: 'show interfaces <端口>', desc: '单接口详情（错包/CRC）', usage: 'sh int g0/1' },
    { cmd: 'show ip interface brief', desc: '三层接口 IP', usage: 'sh ip int b' },
    { cmd: 'show vlan brief', desc: 'VLAN 列表', usage: 'sh vl b' },
    { cmd: 'show mac address-table', desc: 'MAC 地址表', usage: 'sh mac' },
    { cmd: 'show ip arp', desc: 'ARP 表', usage: 'sh ip a' },
    { cmd: 'show ip route', desc: '路由表', usage: 'sh ip r' },
    { cmd: 'show etherchannel summary', desc: '聚合口状态', usage: 'sh eth' },
    { cmd: 'show spanning-tree', desc: '生成树', usage: 'sh sp' },
    { cmd: 'show interface transceiver details', desc: '光模块/光功率', usage: '' },
    { cmd: 'show processes cpu', desc: 'CPU', usage: 'sh pro c' },
    { cmd: 'show memory', desc: '内存', usage: '' },
    { cmd: 'show environment', desc: '温度/电源/风扇', usage: 'sh env' },
    { cmd: 'show logging', desc: '日志', usage: 'sh log' },
    { cmd: 'show inventory', desc: '硬件清单/序列号', usage: 'sh inv' },
    { cmd: 'show cdp neighbors', desc: '邻居设备（思科专用）', usage: 'sh cdp n' },
    { cmd: 'show lldp neighbors', desc: '邻居设备（通用）', usage: 'sh lldp n' },
    { cmd: 'ping <IP>', desc: '测试连通性', usage: '' },
    { cmd: 'traceroute <IP>', desc: '路由跟踪', usage: 'trace' },
    { cmd: 'write memory', desc: '保存配置', usage: 'wr / copy run start' },
    // ---- 配置模式 ----
    { cmd: 'hostname <名称>', desc: '修改设备名称', usage: 'host' },
    { cmd: 'vlan <id>', desc: '创建 VLAN', usage: '' },
    { cmd: 'interface <端口名>', desc: '进入接口视图', usage: 'int g0/1' },
    { cmd: 'interface range <端口> - <端口>', desc: '批量进入接口视图', usage: 'int r' },
    { cmd: 'interface vlan <id>', desc: '进入 SVI 三层接口', usage: 'int vl 100' },
    { cmd: 'interface Port-channel <id>', desc: '进入聚合口视图', usage: 'int po' },
    { cmd: 'ip route <网段> <掩码> <下一跳>', desc: '添加静态路由', usage: '' },
    { cmd: 'ip routing', desc: '三层交换机开启路由功能', usage: '' },
    { cmd: 'router ospf <id>', desc: '启用 OSPF', usage: '' },
    { cmd: 'network <网段> <反掩码> area <id>', desc: 'OSPF 宣告网段', usage: '' },
    { cmd: 'ip access-list extended <名称>', desc: '创建扩展 ACL', usage: 'ip a' },
    { cmd: 'ip access-group <名称|编号> <in|out>', desc: '接口应用 ACL', usage: 'ip ac' },
    { cmd: 'snmp-server community <名称> <RO|RW>', desc: 'SNMP 团体字', usage: '' },
    { cmd: 'snmp-server host <IP> version 2c <名称>', desc: 'SNMP 告警主机', usage: '' },
    { cmd: 'ntp server <IP>', desc: 'NTP 服务器', usage: '' },
    { cmd: 'crypto key generate rsa modulus 2048', desc: '生成 RSA 密钥对', usage: '' },
    { cmd: 'username <用户名> privilege 15 secret <密码>', desc: '创建管理员用户', usage: '' },
    { cmd: 'line vty 0 4', desc: '进入 VTY 视图', usage: '' },
    // ---- 接口视图 ----
    { cmd: 'ip address <IP> <掩码>', desc: '配置接口 IP', usage: 'ip add' },
    { cmd: 'description <描述>', desc: '接口描述', usage: 'desc' },
    { cmd: 'switchport mode <access|trunk>', desc: '端口模式', usage: 'sw mo' },
    { cmd: 'switchport access vlan <id>', desc: 'Access 口划入 VLAN', usage: 'sw a v' },
    { cmd: 'switchport trunk allowed vlan <列表>', desc: 'Trunk 放行 VLAN', usage: 'sw t a v' },
    { cmd: 'switchport trunk native vlan <id>', desc: 'Trunk Native VLAN', usage: '' },
    { cmd: 'shutdown', desc: '关闭端口', usage: 'sh' },
    { cmd: 'no shutdown', desc: '开启端口', usage: 'n sh' },
    { cmd: 'speed <10|100|1000|auto>', desc: '端口速率', usage: '' },
    { cmd: 'duplex <full|half|auto>', desc: '双工模式', usage: '' },
    { cmd: 'spanning-tree portfast', desc: '接终端快速收敛', usage: '' },
    { cmd: 'channel-group <id> mode <active|passive|on>', desc: '加入聚合组', usage: '' },
    { cmd: 'exit', desc: '退出当前视图', usage: 'ex' },
    { cmd: 'end', desc: '返回特权模式', usage: '' },
  ],

  ruijie: [
    // ---- 特权模式 ----
    { cmd: 'configure terminal', desc: '进入配置模式', usage: '可简写 conf t' },
    { cmd: 'show version', desc: '版本、uptime', usage: 'sh ver' },
    { cmd: 'show running-config', desc: '当前配置', usage: 'sh run' },
    { cmd: 'show interfaces status', desc: '接口状态摘要', usage: 'sh int s' },
    { cmd: 'show interfaces <端口>', desc: '单接口详情', usage: 'sh int g0/1' },
    { cmd: 'show ip interface brief', desc: '三层接口 IP', usage: 'sh ip int b' },
    { cmd: 'show vlan brief', desc: 'VLAN 列表', usage: 'sh vl b' },
    { cmd: 'show mac-address-table', desc: 'MAC 地址表', usage: 'sh mac' },
    { cmd: 'show arp', desc: 'ARP 表', usage: '' },
    { cmd: 'show ip route', desc: '路由表', usage: 'sh ip r' },
    { cmd: 'show aggregatePort summary', desc: '聚合口状态', usage: 'sh ag' },
    { cmd: 'show spanning-tree', desc: '生成树', usage: 'sh sp' },
    { cmd: 'show cpu', desc: 'CPU 使用率', usage: 'sh cpu-statistics' },
    { cmd: 'show memory', desc: '内存', usage: '' },
    { cmd: 'show temperature', desc: '温度', usage: '' },
    { cmd: 'show logging', desc: '日志', usage: '' },
    { cmd: 'show inventory', desc: '硬件信息', usage: '' },
    { cmd: 'show rldp', desc: '环路检测记录', usage: '' },
    { cmd: 'show dhcp snooping', desc: 'DHCP 防护状态', usage: '' },
    { cmd: 'ping <IP>', desc: '测试连通性', usage: '' },
    { cmd: 'tracert <IP>', desc: '路由跟踪', usage: '' },
    { cmd: 'write', desc: '保存配置', usage: 'wr / copy run start' },
    // ---- 配置模式 ----
    { cmd: 'hostname <名称>', desc: '修改设备名称', usage: 'host' },
    { cmd: 'vlan <id>', desc: '创建 VLAN', usage: '' },
    { cmd: 'interface <端口名>', desc: '进入接口视图', usage: 'int g0/1' },
    { cmd: 'interface range <端口> - <端口>', desc: '批量进入接口视图', usage: 'int r' },
    { cmd: 'interface AggregatePort <id>', desc: '进入聚合口视图', usage: 'int ap' },
    { cmd: 'ip route <网段> <掩码> <下一跳>', desc: '添加静态路由', usage: '' },
    { cmd: 'router ospf <id>', desc: '启用 OSPF', usage: '' },
    { cmd: 'service dhcp', desc: '启用 DHCP 服务', usage: '' },
    { cmd: 'ip dhcp pool <名称>', desc: '创建 DHCP 地址池', usage: '' },
    { cmd: 'ip access-list extended <编号>', desc: '创建扩展 ACL', usage: 'ip a e' },
    { cmd: 'ip access-group <编号> <in|out>', desc: '接口应用 ACL', usage: 'ip ac' },
    { cmd: 'snmp-server community <名称> <ro|rw>', desc: 'SNMP 团体字', usage: '' },
    { cmd: 'ntp server <IP>', desc: 'NTP 服务器', usage: '' },
    { cmd: 'enable service ssh-server', desc: '启用 SSH 服务', usage: '' },
    { cmd: 'username <用户名> privilege 15 password <密码>', desc: '创建管理员用户', usage: '' },
    // ---- 接口视图 ----
    { cmd: 'ip address <IP> <掩码>', desc: '配置接口 IP', usage: 'ip add' },
    { cmd: 'description <描述>', desc: '接口描述', usage: 'desc' },
    { cmd: 'switchport mode <access|trunk>', desc: '端口模式', usage: 'sw mo' },
    { cmd: 'switchport access vlan <id>', desc: 'Access 口划入 VLAN', usage: 'sw a v' },
    { cmd: 'switchport trunk allowed vlan <only|remove> <列表>', desc: 'Trunk 放行调整', usage: '' },
    { cmd: 'rldp enable', desc: '启用环路检测（锐捷特色）', usage: '' },
    { cmd: 'ip dhcp snooping trust', desc: 'DHCP 信任口', usage: '' },
    { cmd: 'shutdown', desc: '关闭端口', usage: 'sh' },
    { cmd: 'no shutdown', desc: '开启端口', usage: 'n sh' },
    { cmd: 'speed <auto|100|1000>', desc: '速率', usage: '' },
    { cmd: 'port-group <id> mode <active|on>', desc: '加入聚合组', usage: '' },
    { cmd: 'exit', desc: '退出当前视图', usage: 'ex' },
    { cmd: 'end', desc: '返回特权模式', usage: '' },
  ],
}

// ============ 命令大全（含配置模板，用于命令大全弹窗展示） ============
// 移植自模拟器 CMD_LIB，按厂商分组；sections 每类含 cmds（命令+中文解释表）与 code（配置模板）
const CMD_LIB = {
  huawei: {
    label: '华为 Huawei',
    sections: {
      view: { name: '查看类命令', desc: '巡检/排障常用', cmds: [
        ['display version', '版本、运行时长'],
        ['display current-configuration', '当前配置'],
        ['display saved-configuration', '已保存配置'],
        ['display device', '单板状态'],
        ['display interface brief', '接口状态摘要'],
        ['display interface GigabitEthernet0/0/1', '单接口详情'],
        ['display ip interface brief', '三层接口 IP'],
        ['display vlan / display vlan 100', 'VLAN 列表/详情'],
        ['display mac-address', 'MAC 地址表'],
        ['display arp all', 'ARP 表'],
        ['display ip routing-table', '路由表'],
        ['display eth-trunk 1', '聚合口状态'],
        ['display stp brief', '生成树'],
        ['display transceiver interface GigabitEthernet0/0/1', '光模块信息'],
        ['display cpu-usage', 'CPU 使用率'],
        ['display memory-usage', '内存'],
        ['display temperature', '温度'],
        ['display logbuffer', '日志缓冲'],
        ['display alarm active', '活动告警'],
      ]},
      vlan: { name: 'VLAN 配置', desc: '创建/划分/Trunk', code:
`system-view
vlan batch 100 200 to 300           # 批量创建 VLAN
vlan 100
 description Office
quit
interface GigabitEthernet0/0/1
 port link-type access              # access / trunk / hybrid
 port default vlan 100              # Access 口划入 VLAN
quit
interface GigabitEthernet0/0/24
 port link-type trunk
 port trunk allow-pass vlan 100 200 # Trunk 放行
 port trunk pvid vlan 1
quit`},
      iface: { name: '接口与聚合', desc: '速率/双工/Eth-Trunk', code:
`system-view
interface GigabitEthernet0/0/1
 description TO-SERVER-01
 undo shutdown
 speed auto / speed 100
 duplex full
 stp edged-port enable
quit
# Eth-Trunk 聚合
interface Eth-Trunk 1
 mode lacp-static                   # LACP 模式（manual 为手工）
quit
interface GigabitEthernet0/0/1
 eth-trunk 1
quit`},
      route: { name: 'IP 路由配置', desc: '静态/OSPF/Vlanif', code:
`system-view
interface Vlanif100
 ip address 192.168.100.1 24
quit
ip route-static 10.20.0.0 16 10.1.1.2
ip route-static 0.0.0.0 0.0.0.0 10.1.1.254
# OSPF
ospf 1 router-id 1.1.1.1
 area 0
  network 10.1.1.0 0.0.0.255
  network 192.168.100.0 0.0.0.255
 quit
quit`},
      acl: { name: 'ACL 配置', desc: '访问控制/traffic-filter', code:
`system-view
acl 3000
 rule 5 permit ip source 192.168.1.0 0.0.0.255
 rule 10 deny ip
quit
interface GigabitEthernet0/0/1
 traffic-filter inbound acl 3000
quit`,
      note: '华为应用 ACL 用 traffic-filter（基于 Traffic Policy），部分型号也支持 packet-filter。ACL 定义后必须被接口引用才生效。' },
      mgmt: { name: 'SNMP/NTP/SSH', desc: '网管/时间/远程登录', code:
`# SNMP v2c
system-view
snmp-agent
snmp-agent community read cipher %密文%
snmp-agent community write cipher %密文%
snmp-agent sys-info version v2c
snmp-agent target-host trap-hostname nms address 10.83.244.9 udp-port 162 trap-paramsname public
# NTP
ntp-service unicast-server 10.1.1.1
clock timezone Beijing add 08:00:00
# SSH
stelnet server enable
rsa local-key-pair create
user-interface vty 0 4
 authentication-mode aaa
 protocol inbound ssh
quit
aaa
 local-user netadmin password irreversible-cipher %密码%
 local-user netadmin privilege level 15
 local-user netadmin service-type ssh
quit
ssh user netadmin authentication-type password`},
      save: { name: '保存与重启', desc: '配置保存/清空/重启', cmds: [
        ['save', '保存配置（确认 y）'],
        ['save flash:/backup.cfg', '另存配置文件'],
        ['reset saved-configuration', '清空保存配置'],
        ['reboot', '重启'],
        ['startup system-software flash:/xxx.cc', '指定启动版本'],
        ['startup saved-configuration flash:/backup.cfg', '指定启动配置'],
      ]},
      troubleshoot: { name: '故障排查', desc: '端口down/CRC/VLAN/路由', cmds: [
        ['端口 down', 'display interface brief → 查 shutdown/速率/对端'],
        ['CRC 错包多', 'display interface → 换光模块/清洁光纤'],
        ['VLAN 不通', 'display vlan / display port vlan 检查放行'],
        ['路由不通', 'display ip routing-table → ping -a 指定源'],
        ['ACL 不生效', 'display acl 3000 → 确认 traffic-filter 方向'],
        ['CPU 高', 'display cpu-usage → display cpu-defend statistics'],
        ['设备重启过', 'display version 看 uptime / display reboot-info'],
      ]},
    }
  },
  h3c: {
    label: 'H3C 华三',
    sections: {
      view: { name: '查看类命令', desc: 'display 系命令', cmds: [
        ['display version', '版本、启动时间、运行时长'],
        ['display current-configuration', '当前配置'],
        ['display saved-configuration', '已保存配置'],
        ['display device', '单板/模块状态'],
        ['display device manuinfo', '序列号、制造信息'],
        ['display interface [brief]', '接口状态摘要或详情'],
        ['display interface GigabitEthernet1/0/1', '单接口详情（速率/双工/错包/CRC）'],
        ['display ip interface brief', '三层接口 IP 状态'],
        ['display vlan / display vlan 100', 'VLAN 列表/详情'],
        ['display mac-address', 'MAC 地址表'],
        ['display arp', 'ARP 表'],
        ['display ip routing-table', '路由表'],
        ['display link-aggregation verbose', '链路聚合详情'],
        ['display stp brief', '生成树端口角色/状态'],
        ['display transceiver interface', '光模块信息（收发光功率）'],
        ['display power', '电源状态'],
        ['display cpu-usage', 'CPU 使用率'],
        ['display memory', '内存使用率'],
        ['display environment', '温度'],
        ['display logbuffer', '日志缓冲区'],
      ]},
      vlan: { name: 'VLAN 配置', desc: '创建/Access/Trunk', code:
`system-view
vlan 100                            # 创建 VLAN
 description Office                 # VLAN 描述
interface range GigabitEthernet1/0/1 to GigabitEthernet1/0/10
port access vlan 100                # Access 口加入 VLAN
quit
interface GigabitEthernet1/0/24
port link-type trunk                # 设为 Trunk
port trunk permit vlan all          # 或 permit vlan 100 200
port trunk pvid vlan 1              # 修改 PVID
quit`},
      iface: { name: '接口配置', desc: '速率/双工/聚合', code:
`system-view
interface GigabitEthernet1/0/1
 description TO-SERVER-01
 undo shutdown                      # 启用接口（shutdown 为关闭）
 speed auto / speed 1000            # 速率（auto 或强制）
 duplex auto / duplex full          # 双工
 port link-type access              # access / trunk / hybrid
 stp edged-port enable              # 边缘端口
 broadcast-suppression 10           # 广播风暴抑制(%)
quit
# 链路聚合（LACP）
interface Bridge-Aggregation 1
 link-aggregation mode dynamic      # LACP
quit
interface range GigabitEthernet1/0/1 to GigabitEthernet1/0/2
 port link-aggregation group 1
quit`},
      route: { name: 'IP 路由配置', desc: '静态/OSPF/Vlan接口', code:
`# 接口 IP
interface Vlan-interface100
 ip address 192.168.100.1 24
quit
# 静态路由
ip route-static 10.20.0.0 16 10.1.1.2
ip route-static 0.0.0.0 0 10.1.1.254          # 默认路由
# OSPF
ospf 1 router-id 1.1.1.1
 area 0
  network 10.1.1.0 0.0.0.255
  network 192.168.100.0 0.0.0.255
 quit
quit`},
      acl: { name: 'ACL 配置', desc: '访问控制/packet-filter', code:
`system-view
acl number 3000
 rule 5 permit ip source 192.168.1.0 0.0.0.255
 rule 10 deny ip
quit
# 应用到接口
interface GigabitEthernet1/0/1
 packet-filter 3000 inbound
quit`,
      note: 'ACL 定义后必须被接口/policy 引用才生效。' },
      mgmt: { name: 'SNMP/NTP/SSH', desc: '网管/时间/远程登录', code:
`# SNMP（v2c）
snmp-agent
snmp-agent community read public
snmp-agent community write private
snmp-agent sys-info version v2c v3
snmp-agent target-host trap address udp-domain 10.83.244.9 params securityname public v2c
# NTP
ntp-service unicast-server 10.1.1.1
clock timezone Beijing add 08:00:00
# SSH
ssh server enable
public-key local create rsa
user-interface vty 0 4
 authentication-mode scheme
 protocol inbound ssh
quit
local-user netadmin class manage
 password simple %密码%
 service-type ssh
 authorization-attribute user-role network-admin
quit`},
      save: { name: '保存与重启', desc: '配置保存/清空/重启', cmds: [
        ['save force', '保存配置（不询问）'],
        ['save', '保存配置（确认 y）'],
        ['reset saved-configuration', '清空保存配置'],
        ['reboot', '重启设备'],
        ['startup-configuration file xxx.cfg', '指定启动配置文件'],
        ['boot-loader file flash:/xxx.bin slot all main', '指定启动版本文件'],
      ]},
      troubleshoot: { name: '故障排查', desc: '端口down/CRC/VLAN/路由', cmds: [
        ['端口 down', 'display interface brief → 看 Link/Speed，检查对端'],
        ['CRC 错包', 'display interface → 看 CRC/输入错误，检查光模块/光纤'],
        ['VLAN 不通', 'display vlan → 检查接口 port trunk permit vlan'],
        ['路由不通', 'ping / tracert → display ip routing-table'],
        ['MAC 漂移', 'display mac-address 看 MAC 出现多接口'],
        ['CPU 高', 'display cpu-usage → display process cpu'],
        ['光功率异常', 'display transceiver diagnosis interface（TX/RX dBm）'],
      ]},
    }
  },
  cisco: {
    label: '思科 Cisco',
    sections: {
      view: { name: '查看类命令', desc: 'show 系命令', cmds: [
        ['show version', '版本、uptime、序列号'],
        ['show running-config', '当前配置'],
        ['show startup-config', '启动配置'],
        ['show interfaces status', '接口状态摘要（交换机）'],
        ['show interfaces GigabitEthernet0/1', '单接口详情（错包/CRC）'],
        ['show ip interface brief', '三层接口 IP'],
        ['show vlan brief', 'VLAN 列表'],
        ['show mac address-table', 'MAC 表'],
        ['show ip arp', 'ARP 表'],
        ['show ip route', '路由表'],
        ['show etherchannel summary', '聚合口状态'],
        ['show spanning-tree', '生成树'],
        ['show interface transceiver details', '光模块/光功率'],
        ['show processes cpu', 'CPU'],
        ['show memory', '内存'],
        ['show environment', '温度/电源/风扇'],
        ['show logging', '日志'],
        ['show inventory', '硬件清单/序列号'],
        ['show cdp neighbors', '邻居设备（思科专用）'],
        ['show lldp neighbors', '邻居设备（通用）'],
      ]},
      vlan: { name: 'VLAN 配置', desc: '创建/Access/Trunk', code:
`configure terminal
vlan 100
 name Office
exit
interface GigabitEthernet0/1
 switchport mode access
 switchport access vlan 100
exit
interface GigabitEthernet0/24
 switchport mode trunk
 switchport trunk allowed vlan 100,200
 switchport trunk native vlan 1
exit`},
      iface: { name: '接口与聚合', desc: '速率/双工/EtherChannel', code:
`configure terminal
interface GigabitEthernet0/1
 description TO-SERVER-01
 no shutdown
 speed 1000
 duplex full
 spanning-tree portfast           # 接终端快速收敛
exit
# EtherChannel 聚合
interface range GigabitEthernet0/1 - 2
 channel-group 1 mode active      # LACP active
exit
interface Port-channel 1
 switchport mode trunk
exit`},
      route: { name: 'IP 路由配置', desc: '静态/OSPF/SVI', code:
`configure terminal
ip routing                          # 三层交换机开启路由功能
interface Vlan100
 ip address 192.168.100.1 255.255.255.0
 no shutdown
exit
ip route 10.20.0.0 255.255.0.0 10.1.1.2
ip route 0.0.0.0 0.0.0.0 10.1.1.254
# OSPF
router ospf 1
 router-id 1.1.1.1
 network 10.1.1.0 0.0.0.255 area 0
exit`},
      acl: { name: 'ACL 配置', desc: '访问控制/ip access-group', code:
`configure terminal
ip access-list extended EXT-100
 10 permit ip 192.168.1.0 0.0.0.255 any
 20 deny ip any any
exit
interface GigabitEthernet0/1
 ip access-group EXT-100 in
exit`,
      note: 'ACL 隐含最后一条 deny any。标准 ACL 编号 1-99，扩展 ACL 100-199。' },
      mgmt: { name: 'SNMP/NTP/SSH', desc: '网管/时间/远程登录', code:
`# SNMP v2c
configure terminal
snmp-server community public RO
snmp-server community private RW
snmp-server host 10.83.244.9 version 2c public
snmp-server enable traps
# NTP
ntp server 10.1.1.1
clock timezone Beijing 8 0
# SSH
hostname SW1
ip domain-name example.com
crypto key generate rsa modulus 2048
username netadmin privilege 15 secret %密码%
line vty 0 4
 transport input ssh
 login local
exit
ip ssh version 2`},
      save: { name: '保存与重启', desc: '配置保存/清空/重启', cmds: [
        ['write memory / copy run start', '保存配置'],
        ['copy running-config flash:/backup.cfg', '备份配置'],
        ['erase startup-config', '清空启动配置'],
        ['reload', '重启'],
        ['boot system flash:xxx.bin', '指定启动镜像'],
      ]},
      troubleshoot: { name: '故障排查', desc: '端口down/CRC/VLAN/路由', cmds: [
        ['端口 down/err-disable', 'show interfaces status → show err-disable recovery'],
        ['CRC 错包', 'show interfaces → 看 CRC，换线/光模块'],
        ['VLAN 不通', 'show vlan brief + show interfaces trunk'],
        ['VLAN 被修剪', 'show interfaces trunk 看 allowed/active/forwarding'],
        ['路由不通', 'show ip route → ping / traceroute'],
        ['MAC 漂移', 'show mac address-table 多接口闪动'],
        ['聚合异常', 'show etherchannel summary（P=S ok, D=down）'],
        ['CPU 高', 'show processes cpu sorted → show ip traffic'],
      ]},
    }
  },
  ruijie: {
    label: '锐捷 Ruijie',
    sections: {
      view: { name: '查看类命令', desc: 'show 系命令', cmds: [
        ['show version', '版本、uptime'],
        ['show running-config', '当前配置'],
        ['show interfaces status', '接口状态摘要'],
        ['show interfaces GigabitEthernet 0/1', '单接口详情'],
        ['show ip interface brief', '三层接口 IP'],
        ['show vlan brief', 'VLAN 列表'],
        ['show mac-address-table', 'MAC 表'],
        ['show arp', 'ARP 表'],
        ['show ip route', '路由表'],
        ['show aggregatePort summary', '聚合口状态'],
        ['show spanning-tree', '生成树'],
        ['show cpu / show cpu-statistics', 'CPU'],
        ['show memory', '内存'],
        ['show temperature', '温度'],
        ['show logging', '日志'],
        ['show inventory', '硬件信息'],
        ['show rldp', '环路检测记录'],
        ['show dhcp snooping', 'DHCP 防护状态'],
      ]},
      vlan: { name: 'VLAN 配置', desc: '创建/Access/Trunk', code:
`configure terminal
vlan 100
 name Office
exit
interface GigabitEthernet 0/1
 switchport mode access
 switchport access vlan 100
exit
interface GigabitEthernet 0/24
 switchport mode trunk
 switchport trunk allowed vlan remove 1-99     # Trunk 放行（默认全放行再剔除）
exit`,
      note: '锐捷 Trunk 默认放行所有 VLAN，常用 allowed vlan only 100,200 或 remove 调整。' },
      iface: { name: '接口与聚合', desc: '速率/双工/RLDP环路检测', code:
`configure terminal
interface GigabitEthernet 0/1
 description TO-SERVER-01
 speed auto
 duplex auto
 rldp enable                       # 锐捷环路检测（推荐开启）
exit
# AP 聚合
interface range GigabitEthernet 0/1-2
 port-group 1 mode active          # LACP
exit
interface AggregatePort 1
 switchport mode trunk
exit`},
      route: { name: 'IP 路由配置', desc: '静态/OSPF/DHCP', code:
`configure terminal
ip route 10.20.0.0 255.255.0.0 10.1.1.2
ip route 0.0.0.0 0.0.0.0 10.1.1.254
# OSPF
router ospf 1
 network 10.1.1.0 0.0.0.255 area 0
exit
# DHCP
service dhcp
ip dhcp pool vlan100
 network 192.168.100.0 255.255.255.0
 default-router 192.168.100.1
 dns-server 223.5.5.5
exit`},
      acl: { name: 'ACL 配置', desc: '访问控制/ip access-group', code:
`configure terminal
ip access-list extended 100
 10 permit ip 192.168.1.0 0.0.0.255 any
 20 deny ip any any
exit
interface GigabitEthernet 0/1
 ip access-group 100 in
exit`,
      note: '锐捷还有独立的时间 ACL / 专家 ACL（expert），园区网常用。' },
      mgmt: { name: 'SNMP/NTP/SSH', desc: '网管/时间/远程登录', code:
`# SNMP v2c
configure terminal
snmp-server community public ro
snmp-server community private rw
snmp-server host 10.83.244.9 traps version 2c public
snmp-server enable traps
# NTP
ntp server 10.1.1.1
clock timezone Beijing add 8 0 0
# SSH
enable service ssh-server
username netadmin privilege 15 password %密码%
line vty 0 4
 login local
 transport input ssh
exit`},
      save: { name: '保存与重启', desc: '配置保存/清空/重启', cmds: [
        ['write / copy running-config startup-config', '保存配置'],
        ['write file flash:/backup.cfg', '另存'],
        ['del flash:/config.text', '清空配置（配合 reload）'],
        ['reload', '重启'],
      ]},
      feature: { name: '特色功能', desc: 'RLDP环路/DHCP Snooping', code:
`# 环路检测 RLDP（锐捷特色，接入层强烈推荐）
interface GigabitEthernet 0/1
 rldp enable
exit
rldp detect-loop block 30          # 检测到环路关闭端口30秒

# 防私接 DHCP Snooping
ip dhcp snooping
interface GigabitEthernet 0/24
 ip dhcp snooping trust
exit`},
      troubleshoot: { name: '故障排查', desc: '环路/端口down/VLAN/路由', cmds: [
        ['环路掉线', 'show rldp → 看环路封端口记录'],
        ['端口 down', 'show interfaces status'],
        ['VLAN 不通', 'show vlan brief + show interfaces trunk'],
        ['MAC 漂移', 'show mac-address-table'],
        ['聚合异常', 'show aggregatePort summary'],
        ['DHCP 不通', 'show dhcp snooping → show ip dhcp binding'],
        ['CPU 高', 'show cpu-statistics → show ip traffic'],
      ]},
    }
  },
}

// ============ 前缀联想引擎 ============
// 移植自模拟器 cmdMatch：每个单词只需输入到无歧义的前缀。
// 例：sys → system-view   dis ver → display version   int → interface
// cmd 中的 <参数> 为占位符，不参与严格匹配（低词数完整匹配后剩余输入视作参数）。

/**
 * 匹配联想候选。
 * @param {string} input 当前输入行（如 "dis ver"、"int g0/0/1"、"sy"）
 * @param {Array} entries 命令表 [{cmd, desc, usage}]
 * @returns {Array} 候选列表（最多 10 条，按匹配词数降序）
 */
export function matchSuggestions(input, entries) {
  const rawToks = String(input || '').trim().split(/\s+/).filter(Boolean)
  if (!rawToks.length) return []
  const lowToks = rawToks.map(t => t.toLowerCase())
  const cand = []
  for (const e of entries) {
    const cToks = e.cmd.toLowerCase().split(/\s+/)
    // 实词匹配数：输入 token 与命令实词（非占位）严格前缀匹配的数量
    const n = Math.min(lowToks.length, cToks.length)
    let ok = true
    let solidMatched = 0
    for (let i = 0; i < n; i++) {
      const ct = cToks[i]
      if (ct.startsWith('<')) break // 从占位符起视为参数区，不再严格匹配
      if (!ct.startsWith(lowToks[i])) { ok = false; break }
      solidMatched++
    }
    // 输入 token 数不能超过命令总 token 数（含占位）
    if (ok && lowToks.length <= cToks.length) cand.push({ e, cToks, solidMatched })
  }
  // 排序：实词匹配数多的优先（n sh → no shutdown 优先于 network <网段>...）
  //       → 命令更简洁的优先（sy → system-view 优先于 sysname <名称>）
  //       → 字典序稳定
  cand.sort((a, b) =>
    b.solidMatched - a.solidMatched ||
    a.cToks.length - b.cToks.length ||
    a.e.cmd.localeCompare(b.e.cmd)
  )
  return cand.map(c => c.e).slice(0, 10)
}

/**
 * Tab 补全：取第一候选补全命令骨架（IDE 习惯：候选列表第一项优先）
 * @returns {string|null} 补全文本，无候选返回 null
 */
export function tabComplete(input, entries) {
  const cands = matchSuggestions(input, entries)
  if (!cands.length) return null
  const cToks = cands[0].cmd.split(/\s+/)
  const lowToks = String(input).trim().split(/\s+/).filter(Boolean)
  const solidLen = cToks.filter(t => !t.startsWith('<')).length
  if (lowToks.length >= solidLen) {
    // 已输入到参数区 → 补全到实词（清掉参数输入保留命令骨架）
    return cToks.slice(0, solidLen).join(' ') + ' '
  }
  return cToks.join(' ').replace(/ <[^>]*>.*$/, '') + ' '
}

/**
 * 按设备厂商取联想命令表。
 * @param {string} vendor 厂商名（中文/英文均可，如 '华为'、'huawei'、'H3C'、'思科'、'锐捷'）
 * @returns {Array} 该厂商命令表；未识别返回 null（调用方可用 getAllSuggestions 兜底）
 */
export function getSuggestionsByVendor(vendor) {
  const v = String(vendor || '').toLowerCase()
  if (v.includes('华为') || v.includes('huawei')) return SUGGEST_LIB.huawei
  if (v.includes('h3c') || v.includes('华三') || v.includes('新华三')) return SUGGEST_LIB.h3c
  if (v.includes('cisco') || v.includes('思科')) return SUGGEST_LIB.cisco
  if (v.includes('ruijie') || v.includes('锐捷')) return SUGGEST_LIB.ruijie
  return null
}

/** 全部厂商命令表合并（厂商未识别时的兜底联想） */
export function getAllSuggestions() {
  return [...SUGGEST_LIB.huawei, ...SUGGEST_LIB.h3c, ...SUGGEST_LIB.cisco, ...SUGGEST_LIB.ruijie]
}

export { SUGGEST_LIB, CMD_LIB }
