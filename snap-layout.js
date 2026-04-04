/**
 * snap-layout.js
 * Enables Windows 11 Snap Layout flyout on the maximize button
 * by subclassing the window procedure and returning HTMAXBUTTON
 * when WM_NCHITTEST fires over the maximize button's screen rect.
 */

let _koffi = null
let _subclassProc = null  // keep reference alive to prevent GC
let _hwnd = null

const WM_NCHITTEST    = 0x0084
const HTMAXBUTTON     = 9
const HTTRANSPARENT   = -1  // let DefSubclassProc handle
const GWLP_USERDATA   = -21

function load() {
  if (_koffi) return _koffi
  try {
    _koffi = require('koffi')
  } catch (e) {
    console.warn('[snap-layout] koffi not available:', e.message)
  }
  return _koffi
}

/**
 * Install Snap Layout support on the given BrowserWindow.
 * maxBtnRect is a getter function: () => { x, y, w, h } in screen pixels
 */
function install(win, getMaxBtnRect) {
  if (process.platform !== 'win32') return
  const koffi = load()
  if (!koffi) return

  try {
    const user32 = koffi.load('user32.dll')
    const comctl32 = koffi.load('comctl32.dll')

    // Subclass callback type: (hwnd, msg, wParam, lParam, uIdSubclass, dwRefData) -> LRESULT
    const SUBCLASSPROC = koffi.proto('__stdcall', 'SUBCLASSPROC', 'intptr', [
      'void *', 'uint32', 'uintptr', 'intptr', 'uintptr', 'uintptr'
    ])

    const SetWindowSubclass = comctl32.func('__stdcall', 'SetWindowSubclass', 'bool', [
      'void *', koffi.pointer(SUBCLASSPROC), 'uintptr', 'uintptr'
    ])
    const DefSubclassProc = comctl32.func('__stdcall', 'DefSubclassProc', 'intptr', [
      'void *', 'uint32', 'uintptr', 'intptr'
    ])
    const GetCursorPos = user32.func('__stdcall', 'GetCursorPos', 'bool', [koffi.out(koffi.pointer('int32[2]'))])

    _hwnd = win.getNativeWindowHandle()

    _subclassProc = koffi.register((hwnd, msg, wParam, lParam, uIdSubclass, dwRefData) => {
      if (msg === WM_NCHITTEST) {
        const pt = [0, 0]
        GetCursorPos(pt)
        const cx = pt[0], cy = pt[1]
        const rect = getMaxBtnRect()
        if (rect && cx >= rect.x && cx < rect.x + rect.w && cy >= rect.y && cy < rect.y + rect.h) {
          return HTMAXBUTTON
        }
      }
      return DefSubclassProc(hwnd, msg, wParam, lParam)
    }, koffi.pointer(SUBCLASSPROC))

    const ok = SetWindowSubclass(_hwnd, _subclassProc, 1, 0)
    if (!ok) {
      console.warn('[snap-layout] SetWindowSubclass failed')
    }
  } catch (e) {
    console.warn('[snap-layout] setup failed:', e.message)
  }
}

module.exports = { install }
