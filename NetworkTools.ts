// NetworkTools.ts - Capacitor 插件包装器
export interface NetworkToolsPlugin {
  executeCommand(options: { command: string }): Promise<{ output: string; exitCode: number }>;
  ping(options: { target: string; count?: number; timeout?: number }): Promise<{ output: string; exitCode: number }>;
  traceroute(options: { target: string; maxHops?: number }): Promise<{ output: string; exitCode: number }>;
  nslookup(options: { domain: string }): Promise<{ output: string; exitCode: number }>;
}

const NetworkTools = {
  async executeCommand(options: { command: string }): Promise<{ output: string; exitCode: number }> {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return (window as any).Capacitor.Plugins.NetworkTools.executeCommand(options);
    }
    throw new Error('NetworkTools plugin is only available on Android');
  },

  async ping(options: { target: string; count?: number; timeout?: number }): Promise<{ output: string; exitCode: number }> {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return (window as any).Capacitor.Plugins.NetworkTools.ping(options);
    }
    throw new Error('NetworkTools plugin is only available on Android');
  },

  async traceroute(options: { target: string; maxHops?: number }): Promise<{ output: string; exitCode: number }> {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return (window as any).Capacitor.Plugins.NetworkTools.traceroute(options);
    }
    throw new Error('NetworkTools plugin is only available on Android');
  },

  async nslookup(options: { domain: string }): Promise<{ output: string; exitCode: number }> {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      return (window as any).Capacitor.Plugins.NetworkTools.nslookup(options);
    }
    throw new Error('NetworkTools plugin is only available on Android');
  }
};

export default NetworkTools;
