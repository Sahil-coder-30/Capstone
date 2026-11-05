import { ChevronDown } from 'lucide-react';
import './Faq.scss';

const ITEMS = [
  {
    q: 'When does a new plan start?',
    a: 'With no paid plan, it starts right away. Buying the same plan adds 30 days to it. A higher plan starts right away and the days left on your old plan wait in the queue. A lower plan waits in the queue until your current plan ends.',
  },
  {
    q: 'Do plans renew on their own?',
    a: 'No. Each payment buys 30 days. You are never charged again unless you buy again.',
  },
  {
    q: 'How do AI credits work?',
    a: 'Each plan gives a balance of AI credits (Free 20, Pro 150, Max 200). One credit is 1,000 tokens. When fewer than 5 credits are left, AI requests pause and the full balance comes back 5 hours later.',
  },
  {
    q: 'Which payment methods can I use?',
    a: 'UPI, debit and credit cards, net banking and wallets, through Razorpay. Taksha never sees your card or bank details.',
  },
  {
    q: 'Where do I find my invoices?',
    a: 'Every successful payment gets an invoice number. Open Invoices in the sidebar to view or print any of them.',
  },
];

/** Native <details> accordion: keyboard and screen reader friendly with no JS state. */
export default function Faq() {
  return (
    <div className="faq">
      {ITEMS.map((item) => (
        <details key={item.q} className="faq__item">
          <summary>
            {item.q}
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
