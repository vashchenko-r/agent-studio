export interface WorkspaceFolderLike {
  uri: { scheme: string; fsPath: string };
}

/** First local folder. An empty window, or a virtual folder opened first, is not a project root. */
export function firstFileWorkspaceRoot(folders: readonly WorkspaceFolderLike[] | undefined): string | undefined {
  return folders?.find((folder) => folder.uri.scheme === "file")?.uri.fsPath;
}
