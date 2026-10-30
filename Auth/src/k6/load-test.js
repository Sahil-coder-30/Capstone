import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '20s'
};


export default function () {
  const response = http.get('http://localhost:3000/healthz');

  check(response, {
    'status is 200': (r) => r.status === 200,
  });
  sleep(1);
}
