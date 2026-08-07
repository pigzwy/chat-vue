import { z } from 'zod'
import { imageQualities, imageRatios, imageResolutions } from './images'
import { isImageMediaModelId, isVideoMediaModelId } from './mediaModels'

export const imageRatioSchema = z.enum(imageRatios)
export const imageResolutionSchema = z.enum(imageResolutions)
export const imageQualitySchema = z.enum(imageQualities)

export const imageModelSchema = z.string()
  .trim()
  .min(1)
  .refine(isImageMediaModelId, 'Unsupported image model')

export const videoModelSchema = z.string()
  .trim()
  .min(1)
  .refine(isVideoMediaModelId, 'Unsupported video model')

export const videoDurationSchema = z.coerce.number().int().min(1).max(15)
