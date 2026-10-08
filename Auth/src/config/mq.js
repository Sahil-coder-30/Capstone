import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import ampqlib from 'amqplib';
import dotenv from 'dotenv';
dotenv.config();


const QUEUE = 'auth_notification_queue';

let channel;

try {
    const connection = await ampqlib.connect(process.env.MQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE, { durable: true });
    console.log(`[Auth MQ] Connected to RabbitMQ queue: ${QUEUE}`);
} catch (error) {
    console.error('[Auth MQ] Failed to connect to RabbitMQ:', error.message);
}

export const sendAuthNotification = async (message) => {
    if (!channel) {
        console.error('[Auth MQ] Channel not initialized. Message not sent:', message);
        return false;
    }
    return channel.sendToQueue(
        QUEUE,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );
};

export default channel;

