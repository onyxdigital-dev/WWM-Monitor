/**
 * snap-layout.js
 * Enables Windows 11 Snap Layout flyout by subclassing the WNDPROC
 * via SetWindowLongPtrW and returning HTMAXBUTTON on WM_NCHITTEST
 * when the cursor is over the maximize button.
 */

const WM_NCHITTEST = 0x0084
const WM_DESTROY   = 0x0002
const HTMAXBUTTON  = 9
const GWLP_WNDPROC = -4

let _origProc = null
let _newProc  = null  // keep alive — GC would break the callback
let _koffi    = null

function getHwnd(win) {
  const buf = win.getNativeWindowHandle()
  // Buffer contains the HWND integer; read as little-endian
  return process.arch === 'x64'
    ? Number(buf.readBigUInt64LE(0))
    : buf.readUInt32LE(0)
}

function install(win, getMaxBtnRect) {
  if (process.platform !== 'win32') return
  try {
    _koffi = require('koffi')
  } catch (e) {
    console.warn('[snap-layout] koffi not available:', e.message)
    return
  }

  try {
    const user32   = _koffi.load('user32.dll')
    const kernel32 = _koffi.load('kernel32.dll')

    const WndProcProto = _koffi.proto('__stdcall', 'WndProc', 'intptr', [
      'uintptr', 'uint32', 'uintptr', 'intptr'
    ])

    const SetWindowLongPtrW = user32.func('__stdcall', 'SetWindowLongPtrW', 'intptr', [
      'uintptr', 'int32', 'intptr'
    ])
    const CallWindowProcW = user32.func('__stdcall', 'CallWindowProcW', 'intptr', [
      'intptr', 'uintptr', 'uint32', 'uintptr', 'intptr'
    ])
    const GetLastError = kernel32.func('__stdcall', 'GetLastError', 'uint32', [])

    const hwnd = getHwnd(win)
    if (!hwnd) {
      console.warn('[snap-layout] could not get HWND')
      return
    }

    _newProc = _koffi.register((hWnd, msg, wParam, lParam) => {
      if (msg === WM_NCHITTEST) {
        const rect = getMaxBtnRect()
        if (rect) {
          // lParam low word = x, high word = y (screen coords, signed)
          const sx = (lParam & 0xFFFF)
          const sy = ((lParam >> 16) & 0xFFFF)
          // Sign-extend 16-bit values
          const cx = sx >= 0x8000 ? sx - 0x10000 : sx
          const cy = sy >= 0x8000 ? sy - 0x10000 : sy
          if (cx >= rect.x && cx < rect.x + rect.w &&
              cy >= rect.y && cy < rect.y + rect.h) {
            return HTMAXBUTTON
          }
        }
      }
      return CallWindowProcW(_origProc, hWnd, msg, wParam, lParam)
    }, _koffi.pointer(WndProcProto))

    _origProc = SetWindowLongPtrW(hwnd, GWLP_WNDPROC, _koffi.address(_newProc))

    if (!_origProc) {
      const err = GetLastError()
      console.warn('[snap-layout] SetWindowLongPtrW failed, error:', err)
      _newProc = null
      return
    }

    console.log('[snap-layout] installed, hwnd:', hwnd.toString(16))
  } catch (e) {
    console.warn('[snap-layout] setup failed:', e.message)
  }
}

module.exports = { install }
