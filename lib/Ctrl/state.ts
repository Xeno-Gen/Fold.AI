// Shared control panel state - accessible from main server and ctrl server
export const ctrlState: {
  disableFileUpload: boolean;
  disableSaveConversation: boolean;
  disableAllPlugins: boolean;
  disableWorkDir: boolean;
  ipAccessMode: 'local' | 'lan' | 'open';
} = {
  disableFileUpload: false,
  disableSaveConversation: false,
  disableAllPlugins: false,
  disableWorkDir: false,
  ipAccessMode: 'local',
};
