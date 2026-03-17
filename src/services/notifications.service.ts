const store: Array<{ id: string; userId: string; title: string; read: boolean; createdAt: Date }> = []

export const notificationsService = {
  async list(userId: string) {
    return store.filter((n) => n.userId === userId)
  },
  async markRead(_id: string, _userId: string) {
    // placeholder
  },
}
