import amqplib from 'amqplib';
import dotenv from 'dotenv';
dotenv.config();

export const AUTH_QUEUE = 'auth_notification_queue';
export const PAYMENT_QUEUE = 'payment_notification_queue';

const connection = await amqplib.connect(process.env.MQ_URL);

const channel = await connection.createChannel();

await channel.assertQueue(AUTH_QUEUE, { durable: true });
await channel.assertQueue(PAYMENT_QUEUE, { durable: true });

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