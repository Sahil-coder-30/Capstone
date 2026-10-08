import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import amqplib from 'amqplib';
import dotenv from 'dotenv';
dotenv.config();

export const AUTH_QUEUE = 'auth_notification_queue';
export const PAYMENT_QUEUE = 'payment_notification_queue';

async function connectMQ(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const conn = await amqplib.connect(process.env.MQ_URL);
      const ch = await conn.createChannel();
      await ch.assertQueue(AUTH_QUEUE, { durable: true });
      await ch.assertQueue(PAYMENT_QUEUE, { durable: true });
      console.log('[Notification MQ] Connected to RabbitMQ successfully');
      return { connection: conn, channel: ch };
    } catch (err) {
      console.error(`[Notification MQ] Connection attempt ${i + 1}/${retries} failed: ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

const { connection, channel } = await connectMQ();

export const sendAuthNotification = async (message) => {
    channel.sendToQueue(
        AUTH_QUEUE,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );
};

export const sendPaymentNotificationMQ = async (message) => {
    channel.sendToQueue(
        PAYMENT_QUEUE,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );
};

export default channel;