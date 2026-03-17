const settings: Record<string, string> = {
  siteName: 'Woontegra',
  contactEmail: 'info@woontegra.com',
  contactPhone: '',
  address: '',
}

export const settingsService = {
  async getPublic() {
    return { siteName: settings.siteName, contactEmail: settings.contactEmail, contactPhone: settings.contactPhone, address: settings.address }
  },
  async getAll() {
    return { ...settings }
  },
  async update(data: Record<string, string>) {
    Object.assign(settings, data)
    return settings
  },
}
