import amqplib from 'amqplib';
import dotenv from 'dotenv';
dotenv.config();

const QUEUE = 'payment_notification_queue';

let connection;
let channel;

try {
    connection = await amqplib.connect(process.env.MQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE, { durable: true });
    console.log(`[Payments MQ] Connected to RabbitMQ queue: ${QUEUE}`);
} catch (error) {
    console.error('[Payments MQ] Failed to connect to RabbitMQ:', error.message);
}

export const sendPaymentNotification = async (message) => {
    if (!channel) {
        console.error('[Payments MQ] Channel not initialized. Message not sent:', message);
        return false;
    }
    return channel.sendToQueue(
        QUEUE,
        Buffer.from(JSON.stringify(message)),
        { persistent: true }
    );
};

export const closeMQ = async () => {
    try {
        if (channel) await channel.close();
        if (connection) await connection.close();
    } catch (_) {}
};

export default channel;


