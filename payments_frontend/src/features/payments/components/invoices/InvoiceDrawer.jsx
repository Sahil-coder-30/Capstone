import { Printer } from 'lucide-react';
import Drawer from '../ui/Drawer';
import Button from '../ui/Button';
import KeyValues from '../ui/KeyValues';
import { StatusPill } from '../ui/Badge';
import { invoiceFields, printInvoice } from '../../utils/invoice';
import './InvoiceDrawer.scss';

/** Invoice preview with print / save as PDF. */
export default function InvoiceDrawer({ tx, user, onClose }) {
  const f = tx ? invoiceFields(tx, user) : null;
  return (
    <Drawer
      open={Boolean(tx)}
      title={f?.status === 'paid' ? `Invoice ${f.number}` : 'Payment attempt'}
      subtitle={f?.date}
      onClose={onClose}
      footer={f?.status === 'paid' && <Button variant="primary" icon={Printer} onClick={() => printInvoice(tx, user)}>Print or save PDF</Button>}
    >
      {f && (
        <div className="invdrawer">
          <div className="invdrawer__head">
            <div>
              <span className="invdrawer__label">Amount</span>
              <strong className="invdrawer__amount">{f.amount}</strong>
            </div>
            <StatusPill status={f.status} />
          </div>

          <section>
            <h3 className="invdrawer__label">Item</h3>
            <div className="invdrawer__item">
              <div>
                <strong>{f.item}</strong>
                <span>{f.validFrom ? `${f.validFrom} – ${f.validUntil}` : '30 days'}</span>
              </div>
              <span>{f.amount}</span>
            </div>
            <KeyValues dense items={[['Taxes', 'Included'], ['Total', f.amount]]} />
          </section>

          <section>
            <h3 className="invdrawer__label">Billed to</h3>
            <KeyValues dense items={[['Name', f.customer], ['Email', f.email]]} />
          </section>

          <section>
            <h3 className="invdrawer__label">Payment</h3>
            <KeyValues dense items={[
              ['Invoice number', <span className="mono" key="i">{f.number}</span>],
              ['Payment ID', <span className="mono" key="p">{f.paymentId}</span>],
              ['Order ID', <span className="mono" key="o">{f.orderId}</span>],
              ['Processed by', 'Razorpay'],
            ]}
            />
          </section>

          {f.status === 'failed' && (
            <p className="invdrawer__note">This payment did not go through, so there is no invoice and you were not charged for it.</p>
          )}
        </div>
      )}
    </Drawer>
  );
}
