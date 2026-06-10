'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useLang } from '@/contexts/LanguageContext'
import type { MaterialPhoto } from '@/lib/types'

interface MaterialPhotoUploadProps {
  materialId: string
  canEdit: boolean
}

export function MaterialPhotoUpload({ materialId, canEdit }: MaterialPhotoUploadProps) {
  const supabase = createClient()
  const { profile } = useAuth()
  const { tr } = useLang()
  const [photos, setPhotos] = useState<MaterialPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPhotos()
  }, [materialId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchPhotos() {
    const { data } = await supabase
      .from('material_photos')
      .select('*')
      .eq('material_id', materialId)
      .order('uploaded_at', { ascending: true })
    setPhotos((data ?? []) as MaterialPhoto[])
  }

  function publicUrl(filePath: string): string {
    const { data } = supabase.storage.from('material-photos').getPublicUrl(filePath)
    return data.publicUrl
  }

  async function handleFiles(files: FileList) {
    if (!files.length || !profile) return
    setUploadError(null)
    setUploading(true)

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${materialId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: storageErr } = await supabase.storage
        .from('material-photos')
        .upload(path, file, { contentType: file.type })

      if (storageErr) {
        setUploadError(storageErr.message)
        continue
      }

      const { error: dbErr } = await supabase.from('material_photos').insert({
        material_id: materialId,
        file_path: path,
        file_name: file.name,
        uploaded_by: profile.id,
      })

      if (dbErr) {
        setUploadError(dbErr.message)
        await supabase.storage.from('material-photos').remove([path])
      }
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    await fetchPhotos()
  }

  async function handleDelete(photo: MaterialPhoto) {
    setDeletingId(photo.id)
    await supabase.storage.from('material-photos').remove([photo.file_path])
    await supabase.from('material_photos').delete().eq('id', photo.id)
    setDeletingId(null)
    await fetchPhotos()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[#0f1b35]">{tr.materialPhotos}</span>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0f1b35] border border-[#0f1b35] rounded-lg hover:bg-[#0f1b35] hover:text-white disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {tr.uploading}
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {tr.uploadPhotos}
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />

      {uploadError && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}

      {photos.length === 0 ? (
        canEdit ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-[#c9a84c] hover:bg-amber-50/30 transition-colors"
          >
            <svg className="mx-auto h-8 w-8 text-gray-300 mb-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-xs text-gray-400">{tr.clickToUploadPhotos}</p>
          </button>
        ) : (
          <p className="text-sm text-gray-400">{tr.noPhotos}</p>
        )
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {photos.map(photo => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicUrl(photo.file_path)}
                alt={photo.file_name}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1">
                <p className="text-white text-[10px] truncate leading-tight">{photo.file_name}</p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  disabled={deletingId === photo.id}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow transition-colors disabled:opacity-70"
                  title={tr.deletePhoto}
                >
                  {deletingId === photo.id ? (
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              onClick={() => !uploading && inputRef.current?.click()}
              disabled={uploading}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center hover:border-[#c9a84c] hover:bg-amber-50/30 transition-colors disabled:opacity-50"
            >
              <svg className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
