export class UIManager {
  static registerRightClickMenuItem() {
    const menuIcon = `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`;
    ztoolkit.Menu.register("item", {
      tag: "menuitem",
      id: "zotero-rag-chat-menuitem",
      label: "Chat with Selected Items",
      commandListener: (ev) => {
        const items = ztoolkit.getGlobal("ZoteroPane").getSelectedItems();
        const itemIds = items.map((i: any) => i.id);
        const mainWindow = ztoolkit.getGlobal("Zotero").getMainWindow();

        mainWindow.openDialog(
          `chrome://${addon.data.config.addonRef}/content/chat.html`,
          "ZoteroRAGChat",
          "chrome,titlebar,toolbar,centerscreen,resizable,scrollbars=yes,width=600,height=800",
          { itemIds: itemIds },
        );
      },
      icon: menuIcon,
    });
  }
}
