// Consume initialize but deliberately never answer it. Remain alive until closed.
console.error(`stalled-stdio-pid:${process.pid}`);
process.stdin.resume();
setInterval(() => {}, 1000);
