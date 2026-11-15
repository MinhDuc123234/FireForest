/** Fixed en-US formatting everywhere (never the browser locale). */
const nf = new Map<string, Intl.NumberFormat>()
function f(min: number, max: number, sign = false) {
  const k = `${min}-${max}-${sign}`
  let x = nf.get(k)
  if (!x) {
    x = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      signDisplay: sign ? 'exceptZero' : 'auto',
    })
    nf.set(k, x)
  }
  return x
}

/** 12,345 */
export const fmtInt = (v: number) => f(0, 0).format(v)
/** fixed decimals: fmtNum(3.14159, 2) = 3.14 */
export const fmtNum = (v: number, d = 1) => f(d, d).format(v)
/** +4.3 / −2.3 (true minus sign) */
export const fmtSigned = (v: number, d = 1) => f(d, d, true).format(v).replace('-', '−')
/** ×4.35 */
export const fmtRatio = (v: number, d = 2) => `×${f(d, d).format(v)}`
/** +318% */
export const fmtPctSigned = (v: number, d = 0) => `${fmtSigned(v, d)}%`

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2012-02" -> "Feb 2012" */
export function fmtMonth(ym: string) {
  return `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`
}
