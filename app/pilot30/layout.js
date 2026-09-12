import './pilot30.css'
import Shell from './components/Shell'

export const metadata = { title: 'PILOT 30 · הפיילוט של ויטלי', description: 'סביבת מחקר, סימולציה ומעקב לפיילוט 30 יום' }

export default function Pilot30Layout({ children }) {
  return <Shell>{children}</Shell>
}
