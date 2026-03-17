export interface User {
  id: string
  email: string
  passwordHash: string
  role: string
  createdAt: Date
}

export interface UserProfile {
  userId: string
  fullName: string
  phone?: string
}

export interface Contact {
  id: string
  name: string
  email: string
  message: string
  createdAt: Date
}

export interface QuoteRequest {
  id: string
  projectType?: string
  service?: string
  brief?: string
  contactName: string
  contactEmail: string
  contactPhone?: string
  status: string
  createdAt: Date
}

export interface Project {
  id: string
  userId: string
  title: string
  status: string
  createdAt: Date
}

export interface SupportTicket {
  id: string
  userId: string
  subject: string
  status: string
  createdAt: Date
}

export interface BlogPost {
  id: string
  slug: string
  title: string
  excerpt: string
  body?: string
  categoryId: string
  status: string
  createdAt: Date
}
