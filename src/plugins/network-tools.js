import { registerPlugin } from '@capacitor/core'

const NetworkTools = registerPlugin('NetworkTools', {
  web: () => import('./network-tools-web').then(m => new m.NetworkToolsWeb())
})

export async function ping(target, count = 4, timeout = 5000) {
  try {
    const result = await NetworkTools.ping({ target, count, timeout })
    return { success: true, output: result.output }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function traceroute(target, maxHops = 30) {
  try {
    const result = await NetworkTools.traceroute({ target, maxHops })
    return { success: true, output: result.output }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function scanPort(target, port, timeout = 5000) {
  try {
    const result = await NetworkTools.scanPort({ target, port, timeout })
    return { success: true, open: result.open, port: result.port }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function nslookup(domain) {
  try {
    const result = await NetworkTools.nslookup({ domain })
    return { success: true, output: result.output }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

export async function executeCommand(command) {
  try {
    const result = await NetworkTools.executeCommand({ command })
    return { success: result.success, output: result.output }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
