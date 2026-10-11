// Связь с API Multi Punk: по id в соцсети найти привязанный аккаунт.
//
// ЗАГЛУШКА. Запрос к Multi Punk пока не делается: не выяснено, каким
// заголовком передаётся MP_API_KEY и что возвращают методы. Когда выяснится,
// здесь нужно:
//   1. GET https://multi-punk.ru/api/users/{provider}/{id}       — аккаунт сайта
//   2. GET https://multi-punk.ru/api/users/{provider}/{id}/xbox  — игровой ник
// и вернуть { id, login, nick }, где nick — имя, под которым игрок записан
// в жителях территорий (residents[].name). Остальной код входа менять не надо.
//
// Возвращает null, если аккаунт не привязан или проверка недоступна.
async function findAccount(provider, id) {
  return null;
}

module.exports = { findAccount };
