import ampqlib from 'amqplib';
import dotenv from 'dotenv';
dotenv.config();


const QUEUE = 'auth_notification_queue';

const connection = await ampqlib.connect(process.env.MQ_URL);

const channel = await connection.createChannel();

channel.assertQueue(QUEUE , {durable : true});

export const sendAuthNotification = async (message) =>{
    channel.sendToQueue(
        QUEUE,
        Buffer.from(JSON.stringify(message)),
        {persistent : true}
    )
}

