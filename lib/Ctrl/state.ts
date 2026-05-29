// Shared control panel state - accessible from main server and ctrl server
export const ctrlState: {
  disableFileUpload: boolean;
  disableSaveConversation: boolean;
  disableAllPlugins: boolean;
} = {
  disableFileUpload: false,
  disableSaveConversation: false,
  disableAllPlugins: false,
};
