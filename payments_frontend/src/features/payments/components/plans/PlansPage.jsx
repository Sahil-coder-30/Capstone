import { useOutletContext } from 'react-router-dom';
import { ArrowUpCircle, CalendarPlus, ListOrdered, Zap } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import Panel from '../ui/Panel';
import PlanCard from './PlanCard';
import CompareTable from './CompareTable';
import Faq from './Faq';
import SubscriptionCard from '../shared/SubscriptionCard';
import useAccount from '../../Hooks/useAccount';
import { PLANS } from '../../utils/plans';
import './PlansPage.scss';

const RULES = [
  { icon: Zap, title: 'No paid plan yet', text: 'Your plan starts the moment the payment goes through.' },
  { icon: CalendarPlus, title: 'Same plan again', text: '30 more days are added to the end of your current plan.' },
  { icon: ArrowUpCircle, title: 'Higher plan', text: 'Starts right away. Days left on your old plan wait in the queue.' },
  { icon: ListOrdered, title: 'Lower plan', text: 'Waits in the queue and starts when your current plan ends.' },
];

export default function PlansPage() {
  const { user } = useOutletContext();
  const { tier } = useAccount();
  const currentTier = user ? tier : null;

  return (
    <div className="plans">
      <PageHeader
        title="Plans"
        description="Pick the plan that fits how much you build. Every paid plan runs for 30 days and never renews on its own."
      />

      <div className="plans__grid">
        {PLANS.map((p) => <PlanCard key={p.id} plan={p} currentTier={currentTier} signedIn={Boolean(user)} />)}
      </div>

      <div className={`grid ${user ? 'grid--1-2' : ''}`}>
        {user && <SubscriptionCard showAction={false} />}
        <Panel title="How buying a plan works" description="Nothing you paid for is ever lost">
          <ul className="plans__rules">
            {RULES.map((r) => (
              <li key={r.title}>
                <span className="plans__rule-icon"><r.icon size={16} aria-hidden="true" /></span>
                <div>
                  <strong>{r.title}</strong>
                  <p>{r.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <h2 className="section-title">Compare plans</h2>
      <Panel flush><CompareTable currentTier={currentTier} /></Panel>

      <h2 className="section-title">Questions</h2>
      <Panel><Faq /></Panel>
    </div>
  );
}
