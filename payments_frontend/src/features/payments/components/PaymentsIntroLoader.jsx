import React, { useState, useEffect, useRef } from 'react';
import ScrambledText from '../../../components/reactbits/ScrambledText';
import styles from './PaymentsIntroLoader.module.scss';

export default function PaymentsIntroLoader({ onComplete }) {
  const [exiting, setExiting] = useState(false);
  const completedRef = useRef(false);

  useEffect(() => {
    // Save session ID into sessionStorage for first-time session tracking
    let storedSession = sessionStorage.getItem('payments_session_id');
    if (!storedSession) {
      storedSession = 'pay_sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
      sessionStorage.setItem('payments_session_id', storedSession);
    }

    // Auto dismiss after 2.4 seconds
    const timer = setTimeout(() => {
      handleFinish();
    }, 2400);

    return () => clearTimeout(timer);
  }, []);

  const handleFinish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setExiting(true);
    setTimeout(() => {
      if (onComplete) onComplete();
    }, 800);
  };

  return (
    <div
      className={`${styles.introContainer} ${exiting ? styles.exiting : ''}`}
      onClick={handleFinish}
    >
      <div className={styles.textWrapper}>
        <ScrambledText
          className={styles.titleScramble}
          radius={120}
          duration={1.2}
          speed={0.5}
          scrambleChars=".:/<>#!@$%*"
        >
          Payments
        </ScrambledText>

        <ScrambledText
          className={styles.subtitleScramble}
          radius={90}
          duration={1.0}
          speed={0.4}
          scrambleChars=".:"
        >
          Powered by Razorpay
        </ScrambledText>
      </div>
    </div>
  );
}
