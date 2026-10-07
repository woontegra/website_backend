import type { Request, Response } from 'express'
import { readBhAdminProductRow } from './bhWebapi.client'
import {
  classifyDownloadStreamError,
  streamDownloadSource,
  resolveDownloadSourceFromRawUrl,
} from '../lib/downloadStream'
import {
  selectBhDesktopInstallerUrl,
  verifyBhDesktopTrialDownloadToken,
} from '../lib/bhDesktopTrialDownload'

export async function streamBhDesktopTrialDownload(token: string, req: Request, res: Response): Promise<void> {
  const payload = verifyBhDesktopTrialDownloadToken(token)
  if (!payload) throw new Error('NOT_FOUND')

  const product = await readBhAdminProductRow()
  const rawUrl = selectBhDesktopInstallerUrl(product, payload.platform)
  const source = resolveDownloadSourceFromRawUrl(rawUrl)
  if (!source) throw new Error('NOT_FOUND')

  try {
    await streamDownloadSource(source, req, res)
  } catch (error) {
    throw new Error(classifyDownloadStreamError(error))
  }
}
