export function archiveTargetData(actorId: string, reason: string, archivedAt = new Date()) {
  return {
    isArchived: true,
    archivedAt,
    archivedBy: actorId,
    archiveReason: reason.trim(),
    // Lưu bản chụp công bố để đối soát, nhưng ngừng hiển thị ngay lập tức.
    isPublic: false,
  } as const;
}

export function restoreTargetData() {
  return {
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    // Khôi phục về nội bộ; quản trị viên phải kiểm tra rồi công bố lại.
    isPublic: false,
  } as const;
}
