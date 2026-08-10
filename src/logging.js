export function installSensitiveLogFilter(logger = console) {
  const originalInfo = console.info.bind(console);
  console.info = (...args) => {
    if (args[0] === 'Closing session:') {
      logger.debug?.('[whatsapp] cryptographic session rotated');
      return;
    }
    originalInfo(...args);
  };
}
