import axios from "axios";

const MAX_REQUESTS_COUNT = 5;
const INTERVAL_MS = 10;

let PENDING_REQUESTS = 0;

const request = axios.create({});

request.interceptors.request.use((config) => (new Promise((resolve) => {
    const interval = setInterval(() => {
        if (PENDING_REQUESTS < MAX_REQUESTS_COUNT) {
            PENDING_REQUESTS += 1;

            clearInterval(interval);
            resolve(config);
        }
    }, INTERVAL_MS);
})));

request.interceptors.response.use((response) => {
    PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);

    return Promise.resolve(response);
}, (error) => {
    PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);

    return Promise.reject(error);
});

export default request;
