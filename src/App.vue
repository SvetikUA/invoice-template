<script setup>
import { ref, computed } from 'vue'
import { supabase } from './supabase'

// Invoice state
const invoiceData = ref({
  invoiceNumber: '',
  date: new Date().toISOString().split('T')[0],
  company: {
    name: '',
    address: '',
    kvk: '',
    btw: ''
  },
  client: {
    name: '',
    address: ''
  },
  items: [
    { id: 1, description: '', quantity: 1, price: 0, btwRate: 21 }
  ]
})

// BTW rates available
const btwRates = [21, 9, 0]

// Logic for items
const addItem = () => {
  invoiceData.value.items.push({
    id: Date.now(),
    description: '',
    quantity: 1,
    price: 0,
    btwRate: 21
  })
}

const removeItem = (id) => {
  if (invoiceData.value.items.length > 1) {
    invoiceData.value.items = invoiceData.value.items.filter(item => item.id !== id)
  }
}

// Calculations
const subtotal = computed(() => {
  return invoiceData.value.items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
})

const btwBreakdown = computed(() => {
  const breakdown = { 21: 0, 9: 0, 0: 0 }
  invoiceData.value.items.forEach(item => {
    const itemTotal = item.quantity * item.price
    breakdown[item.btwRate] += itemTotal * (item.btwRate / 100)
  })
  return breakdown
})

const totalBtw = computed(() => {
  return Object.values(btwBreakdown.value).reduce((sum, val) => sum + val, 0)
})

const grandTotal = computed(() => {
  return subtotal.value + totalBtw.value
})

const formatCurrency = (val) => {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(val)
}

// Validation
const validateForm = () => {
  const c = invoiceData.value.company
  const kl = invoiceData.value.client

  if (!invoiceData.value.invoiceNumber || !invoiceData.value.date) return false
  if (!c.name || !c.address || !c.kvk || !c.btw) return false
  if (!kl.name || !kl.address) return false

  for (const item of invoiceData.value.items) {
    if (!item.description || item.quantity <= 0 || item.price < 0) return false
  }

  return true
}

// Modal and Saving logic
const showModal = ref(false)
const showValidationModal = ref(false)
const isSaving = ref(false)

const openModal = () => {
  if (!validateForm()) {
    showValidationModal.value = true
    return
  }
  showModal.value = true
}

const saveToSupabase = async () => {
  isSaving.value = true
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert([
        {
          invoice_number: invoiceData.value.invoiceNumber,
          data: invoiceData.value,
          total: grandTotal.value
        }
      ])

    if (error) throw error
    console.log('Saved to Supabase successfully')
    return true
  } catch (error) {
    console.error('Error saving to Supabase:', error.message)
    alert('Fout bij opslaan in database: ' + error.message + '\n\nControleer uw supabaseUrl in src/supabase.js (het moet beginnen met https://). De actie gaat nu verder zonder op te slaan in de database.')
    return false
  } finally {
    isSaving.value = false
  }
}

const saveAsPdf = async () => {
  await saveToSupabase()
  showModal.value = false
  const originalTitle = document.title
  document.title = invoiceData.value.invoiceNumber ? `Factuur_${invoiceData.value.invoiceNumber}` : 'Factuur'
  setTimeout(() => {
    window.print()
    document.title = originalTitle
  }, 300)
}

const sendToEmail = async () => {
  await saveToSupabase()
  const subject = encodeURIComponent(`Factuur ${invoiceData.value.invoiceNumber}`)
  const body = encodeURIComponent(`Beste klant,\n\nHierbij stuur ik u de factuur ${invoiceData.value.invoiceNumber} voor een bedrag van ${formatCurrency(grandTotal.value)}.\n\nMet vriendelijke groet,\n${invoiceData.value.company.name}`)
  window.location.href = `mailto:?subject=${subject}&body=${body}`
  showModal.value = false
}

const sendToMessenger = async () => {
  await saveToSupabase()
  const text = encodeURIComponent(`Beste klant, hierbij stuur ik u de factuur ${invoiceData.value.invoiceNumber} voor een bedrag van ${formatCurrency(grandTotal.value)}.\n\nMet vriendelijke groet, ${invoiceData.value.company.name}`)
  window.open(`https://wa.me/?text=${text}`, '_blank')
  showModal.value = false
}

const resetForm = () => {
  if (confirm('Wilt u een nieuwe factuur maken? (Бажаєте очистити форму для нового інвойсу? Дані вашої компанії залишаться).')) {
    invoiceData.value.invoiceNumber = ''
    invoiceData.value.date = new Date().toISOString().split('T')[0]
    invoiceData.value.client = { name: '', address: '' }
    invoiceData.value.items = [ { id: Date.now(), description: '', quantity: 1, price: 0, btwRate: 21 } ]
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white font-sans text-gray-900">
    <!-- Invoice Container -->
    <div class="mx-auto max-w-4xl bg-white p-12 print:p-0 print:shadow-none shadow-xl rounded-2xl relative" id="invoice-document">

      <!-- Header -->
      <div class="flex justify-between items-start border-b border-gray-200 pb-8 mb-8">
        <div>
          <h1 class="text-4xl font-bold text-gray-800 tracking-tight">Factuur</h1>
          <div class="mt-4 flex flex-col gap-2">
            <div class="flex items-center gap-4">
              <span class="text-gray-500 w-32">Factuurnummer:</span>
              <input v-model="invoiceData.invoiceNumber" type="text" placeholder="INV-2023-001" class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div class="flex items-center gap-4">
              <span class="text-gray-500 w-32">Factuurdatum:</span>
              <input v-model="invoiceData.date" type="date" class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
      </div>

      <!-- Addresses -->
      <div class="flex justify-between gap-12 mb-12">
        <div class="flex-1 bg-gray-50 p-6 rounded-xl">
          <h3 class="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Van (ZZP)</h3>
          <div class="flex flex-col gap-3">
            <input v-model="invoiceData.company.name" type="text" placeholder="Bedrijfsnaam / Naam" class="w-full border border-gray-300 rounded px-3 py-2 bg-white" />
            <textarea v-model="invoiceData.company.address" placeholder="Volledig adres" rows="2" class="w-full border border-gray-300 rounded px-3 py-2 bg-white"></textarea>
            <input v-model="invoiceData.company.kvk" type="text" placeholder="KVK nummer" class="w-full border border-gray-300 rounded px-3 py-2 bg-white" />
            <input v-model="invoiceData.company.btw" type="text" placeholder="BTW-id" class="w-full border border-gray-300 rounded px-3 py-2 bg-white" />
          </div>
        </div>

        <div class="flex-1 bg-blue-50 p-6 rounded-xl">
          <h3 class="text-lg font-semibold text-blue-800 mb-4 border-b border-blue-200 pb-2">Aan (Klant)</h3>
          <div class="flex flex-col gap-3">
            <input v-model="invoiceData.client.name" type="text" placeholder="Naam klant / Bedrijf" class="w-full border border-blue-200 rounded px-3 py-2 bg-white" />
            <textarea v-model="invoiceData.client.address" placeholder="Adres" rows="3" class="w-full border border-blue-200 rounded px-3 py-2 bg-white"></textarea>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div class="mb-12">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-gray-100 text-gray-700 text-sm uppercase tracking-wider">
              <th class="p-4 rounded-tl-lg">Omschrijving</th>
              <th class="p-4 w-24">Aantal</th>
              <th class="p-4 w-32">Prijs (ex. BTW)</th>
              <th class="p-4 w-24">BTW %</th>
              <th class="p-4 rounded-tr-lg text-right">Bedrag</th>
              <th class="p-4 w-12 print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in invoiceData.items" :key="item.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <td class="p-2">
                <input v-model="item.description" type="text" placeholder="Omschrijving" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 bg-transparent" />
              </td>
              <td class="p-2">
                <input v-model.number="item.quantity" type="number" min="1" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 bg-transparent" />
              </td>
              <td class="p-2">
                <input v-model.number="item.price" type="number" min="0" step="0.01" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 bg-transparent" />
              </td>
              <td class="p-2">
                <select v-model.number="item.btwRate" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 bg-transparent">
                  <option v-for="rate in btwRates" :key="rate" :value="rate">{{ rate }}%</option>
                </select>
              </td>
              <td class="p-2 text-right font-medium text-gray-700">
                {{ formatCurrency(item.quantity * item.price) }}
              </td>
              <td class="p-2 text-center print:hidden">
                <button @click="removeItem(item.id)" class="text-red-400 hover:text-red-600 transition-colors" title="Verwijderen" v-if="invoiceData.items.length > 1">
                  ✕
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <button @click="addItem" class="mt-4 text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 transition-colors print:hidden">
          <span class="text-lg">+</span> Regel toevoegen
        </button>
      </div>

      <!-- Totals -->
      <div class="flex justify-end mb-8">
        <div class="w-80 bg-gray-50 p-6 rounded-xl">
          <div class="flex justify-between mb-2 text-gray-600">
            <span>Subtotaal (excl. BTW):</span>
            <span>{{ formatCurrency(subtotal) }}</span>
          </div>

          <template v-for="(amount, rate) in btwBreakdown" :key="rate">
            <div v-if="amount > 0" class="flex justify-between mb-2 text-gray-600">
              <span>BTW {{ rate }}%:</span>
              <span>{{ formatCurrency(amount) }}</span>
            </div>
          </template>

          <div class="flex justify-between mt-4 pt-4 border-t border-gray-200 font-bold text-xl text-gray-900">
            <span>Totaal te betalen:</span>
            <span>{{ formatCurrency(grandTotal) }}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Action Buttons (Not printed) -->
    <div class="mx-auto max-w-4xl mt-8 flex justify-end gap-4 print:hidden">
      <button @click="resetForm" class="bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-semibold py-3 px-8 rounded-xl shadow-sm transition-colors">
        Nieuwe factuur (Очистити)
      </button>
      <button @click="openModal" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
        Factuur opslaan
      </button>
    </div>

    <!-- Validation Modal Overlay -->
    <div v-if="showValidationModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all text-center">
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
          <svg class="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">Incomplete gegevens</h3>
        <p class="text-sm text-gray-500 mb-6">Vul alstublieft alle velden in voordat u de factuur opslaat.</p>
        <button @click="showValidationModal = false" class="w-full inline-flex justify-center rounded-xl border border-transparent bg-red-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none sm:text-sm transition-colors">
          Begrepen
        </button>
      </div>
    </div>

    <!-- Modal Overlay -->
    <div v-if="showModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 transform transition-all relative">
        <button @click="showModal = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 class="text-2xl font-bold text-gray-800 mb-2">Opslaan en verzenden</h2>
        <p class="text-gray-500 mb-8">Alle acties slaan automatisch een kopie op in de database.</p>

        <div class="flex flex-col gap-4">
          <button @click="saveAsPdf" :disabled="isSaving" class="flex items-center justify-between w-full p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors group">
            <div class="flex items-center gap-3">
              <div class="bg-blue-100 p-2 rounded-lg text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <span class="font-medium text-gray-700">Opslaan als PDF</span>
            </div>
            <span v-if="isSaving" class="text-sm text-blue-500 animate-pulse">Opslaan...</span>
          </button>

          <button @click="sendToEmail" :disabled="isSaving" class="flex items-center justify-between w-full p-4 border border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors group">
            <div class="flex items-center gap-3">
              <div class="bg-green-100 p-2 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span class="font-medium text-gray-700">Versturen via e-mail</span>
            </div>
          </button>

          <button @click="sendToMessenger" :disabled="isSaving" class="flex items-center justify-between w-full p-4 border border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-colors group">
            <div class="flex items-center gap-3">
              <div class="bg-purple-100 p-2 rounded-lg text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span class="font-medium text-gray-700">Versturen via WhatsApp</span>
            </div>
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
