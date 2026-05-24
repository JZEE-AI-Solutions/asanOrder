/**
 * QuickAddProductPage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Mobile-first single-screen flow for the business owner to onboard products
 * fast. Takes a dress photo (camera or gallery), name, cost, selling price,
 * quantity → POSTs to /api/product/quick-add.
 *
 * The backend route reuses the same service the AI agent uses, so every entry
 * gets:
 *   - Product row (active)
 *   - Primary ProductImage
 *   - PurchaseInvoice + PurchaseItem (so cost/profit tracking stays correct)
 *   - ProductLog (audit)
 *   - ProductEmbedding (CLIP tile-MAX + Lab — agent can match this product visually)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'

function fileToBase64 (file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)   // returns "data:<mime>;base64,…"
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

export default function QuickAddProductPage () {
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const nameRef = useRef(null)

  const [photoFile,  setPhotoFile]  = useState(null)
  const [photoData,  setPhotoData]  = useState('')   // data URL for preview
  const [name,       setName]       = useState('')
  const [costPrice,  setCostPrice]  = useState('')
  const [sellPrice,  setSellPrice]  = useState('')
  const [quantity,   setQuantity]   = useState('')
  const [isStitched, setIsStitched] = useState(false)
  const [saving,     setSaving]     = useState(false)

  const resetForm = useCallback(() => {
    setPhotoFile(null); setPhotoData('')
    setName(''); setCostPrice(''); setSellPrice(''); setQuantity('')
    setIsStitched(false)
    if (fileRef.current) fileRef.current.value = ''
  }, [])

  const onPickPhoto = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 6 * 1024 * 1024) {
      toast.error('Image too large — keep it under 6 MB')
      return
    }
    setPhotoFile(f)
    setPhotoData(await fileToBase64(f))
    // Move focus to name so the owner can start typing immediately.
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const validate = () => {
    if (!photoData)              return 'Please capture or pick a dress photo'
    if (name.trim().length < 2)  return 'Product name is required'
    if (!(parseFloat(costPrice) > 0)) return 'Cost price must be > 0'
    if (!(parseFloat(sellPrice) > 0)) return 'Selling price must be > 0'
    if (!(parseInt(quantity, 10) > 0)) return 'Quantity must be > 0'
    if (parseFloat(sellPrice) < parseFloat(costPrice)) return 'Selling price < Cost price'
    return null
  }

  const submit = async ({ keepOpen }) => {
    const err = validate()
    if (err) { toast.error(err); return null }

    setSaving(true)
    const t = toast.loading('Saving product…')
    try {
      // `api` instance auto-injects the JWT from localStorage and the
      // VITE_API_URL baseURL ('/api/...' becomes absolute in production).
      const { data } = await api.post('/product/quick-add', {
        name: name.trim(),
        costPrice:    parseFloat(costPrice),
        sellingPrice: parseFloat(sellPrice),
        quantity:     parseInt(quantity, 10),
        imageBase64:  photoData,                            // backend strips the data: prefix
        imageMimeType: photoFile?.type || 'image/jpeg',
        isStitched
      })
      toast.success(`✅ ${data.action || 'Saved'} — Invoice ${data.invoiceNumber}`, { id: t })
      if (keepOpen) {
        resetForm()
        setTimeout(() => fileRef.current?.click(), 100)
      } else {
        navigate('/business/products')
      }
      return data
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Save failed'
      toast.error(msg, { id: t })
      return null
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-700 text-white px-4 py-3 shadow flex items-center gap-3 sticky top-0 z-10">
        <button
          onClick={() => navigate('/business')}
          aria-label="Back"
          className="rounded-full px-2 py-1 hover:bg-emerald-600">←</button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">Quick Add Product</div>
          <div className="text-xs opacity-80">Snap → fill 4 fields → save</div>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4 pb-32">
        {/* Photo capture */}
        <div className="bg-white rounded-xl shadow-sm p-3">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Photo
          </label>
          {photoData
            ? (
              <div className="relative">
                <img src={photoData} alt="Dress preview"
                     className="w-full rounded-lg object-cover max-h-72" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-2 right-2 bg-white/90 text-gray-800 text-sm px-3 py-1 rounded-full shadow">
                  Retake
                </button>
              </div>
            )
            : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full h-44 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50">
                <span className="text-4xl mb-1">📷</span>
                <span className="text-sm">Tap to capture or pick a photo</span>
              </button>
            )
          }
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onPickPhoto}
          />
        </div>

        {/* Fields */}
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Black Floral Lawn Suit"
              maxLength={120}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost (Rs.)</label>
              <input
                type="number"
                inputMode="decimal"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="800"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling (Rs.)</label>
              <input
                type="number"
                inputMode="decimal"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="1500"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
              <input
                type="number"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="5"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <label className="flex items-center gap-2 mt-6 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isStitched}
                onChange={(e) => setIsStitched(e.target.checked)}
                className="w-4 h-4"
              />
              Stitched
            </label>
          </div>
        </div>
      </main>

      {/* Sticky action bar */}
      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => submit({ keepOpen: true })}
            className="rounded-lg bg-emerald-500 text-white py-3 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save & Add Another'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => submit({ keepOpen: false })}
            className="rounded-lg bg-emerald-700 text-white py-3 font-medium disabled:opacity-50">
            Save & Done
          </button>
        </div>
      </footer>
    </div>
  )
}
