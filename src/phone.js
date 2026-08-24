export function phoneCandidates(phone) {
  const candidates = [phone];

  if (phone.startsWith('55') && phone.length === 13 && phone[4] === '9') {
    candidates.push(`${phone.slice(0, 4)}${phone.slice(5)}`);
  } else if (phone.startsWith('55') && phone.length === 12) {
    candidates.push(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  }

  return candidates;
}
