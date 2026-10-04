// Sheffield's fixed lines. The persona lives here, not in the model prompt,
// so a small model's context stays free for the menu.

export const say = {
  hello: 'Good day. Paste a menu, attach a photo or file, or tell me what to change.',
  helloNoModel: 'Good day. Paste your menu text or attach a CSV, and I shall arrange it. Hire me below to read photos as well.',
  thinking: 'One moment…',
  reading: 'Reading the photograph…',
  needModel: 'Reading photographs requires hiring me first (one download, then it works offline). Or copy the assistant instructions and use any chat assistant.',
  noPdf: 'I cannot read PDFs just yet. Paste the text, take a photo of the page, or copy the assistant instructions for another assistant.',
  notUnderstood: 'I beg your pardon, I didn’t follow. Try “add Brownie to Desserts”, “rename Cola to Coke”, or paste the whole menu.',
  alreadyThere: 'All of that is on the menu already.',
  nothingFound: 'I couldn’t find any dishes in that, I’m afraid.',
  applied: 'Very good. The menu designer has the new draft; publish when ready.',
  undone: 'Undone.',
  stopped: 'As you wish, I’ve stopped.',
  nothingToUndo: 'Nothing to undo.',
  confused: 'My apologies, my reply came out garbled. Could you say that another way?',
  hired: 'Sheffield is at your service, and works offline from now on.',
  dismissed: mb => `Sheffield has packed up and left${mb ? ` — ${mb} freed` : ''}. Your menus and orders are untouched.`,
  interrupted: 'The download was interrupted. Tap hire again to carry on; the files already fetched are kept.',
  unsupported: 'Sheffield couldn’t start on this tablet. Pasting menus and the assistant instructions still work.'
}

export function summarizeChange({categories, items, groups}) {
  const parts = []
  const n = (count, one, many) => `${Math.abs(count)} ${Math.abs(count) === 1 ? one : many}`
  if (categories > 0) parts.push(n(categories, 'section', 'sections'))
  if (items > 0) parts.push(n(items, 'dish', 'dishes'))
  if (groups > 0) parts.push(n(groups, 'choice group', 'choice groups'))
  const removed = []
  if (categories < 0) removed.push(n(categories, 'section', 'sections'))
  if (items < 0) removed.push(n(items, 'dish', 'dishes'))
  const out = []
  if (parts.length) out.push(`Added ${parts.join(', ')}.`)
  if (removed.length) out.push(`Removed ${removed.join(', ')}.`)
  return out.join(' ') || 'Updated.'
}
