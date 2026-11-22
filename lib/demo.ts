import type { Dashboard } from "./types";

export const demo: Dashboard = {
  user: { id: "demo", email: "probni prikaz" },
  folders: [
    { id: "home", name: "Domaćinstvo", owner: true },
    { id: "weekend", name: "Vikend", owner: true }
  ],
  lists: [
    { id: "weekly", name: "Nedeljna nabavka", folderId: "home", owner: true, permissions: { add: true, edit: true, remove: true } },
    { id: "pantry", name: "Za kuću", folderId: "home", owner: true, permissions: { add: true, edit: true, remove: true } },
    { id: "picnic", name: "Piknik", folderId: "weekend", owner: true, permissions: { add: true, edit: true, remove: true } }
  ],
  items: [
    { id: "milk", listId: "weekly", name: "Mleko", quantity: "2 l", note: "Bez laktoze", checked: false },
    { id: "eggs", listId: "weekly", name: "Jaja", quantity: "10 kom", note: "", checked: false },
    { id: "tomato", listId: "weekly", name: "Čeri paradajz", quantity: "500 g", note: "", checked: false },
    { id: "yogurt", listId: "weekly", name: "Grčki jogurt", quantity: "2 kom", note: "", checked: false },
    { id: "bread", listId: "weekly", name: "Integralni hleb", quantity: "1 kom", note: "", checked: true },
    { id: "banana", listId: "weekly", name: "Banane", quantity: "1 kg", note: "", checked: true },
    { id: "soap", listId: "pantry", name: "Sapun", quantity: "", note: "", checked: false }
  ]
};
