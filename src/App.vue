<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from './supabase'

// Invoice state
const getDueDate = (days = 14) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

const invoiceData = ref({
  invoiceNumber: '',
  date: new Date().toISOString().split('T')[0],
  dueDate: getDueDate(14),
  company: {
    name: 'Svitlana Yavorska',
    address: '6846DX, Arnhem, Nederland',
    kvk: '99639084',
    btw: 'NL005400318B31',
    iban: 'NL79 SNSB 8838 8111 05',
    phone: '+31645038043'
  },
  client: {
    name: '',
    address: '',
    kvk: '',
    vat: '',
    iban: '',
    email: '',
    phone: ''
  },
  items: [
    { id: 1, description: '', quantity: 0, price: 23.5, btwRate: 21 }
  ]
})

const generateInvoiceNumber = async () => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('invoice_number')
      .order('created_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0 && data[0].invoice_number) {
      const lastNumberStr = data[0].invoice_number;
      const match = lastNumberStr.match(/\d+$/);
      if (match) {
        const nextNum = parseInt(match[0], 10) + 1;
        const padded = nextNum.toString().padStart(match[0].length, '0');
        invoiceData.value.invoiceNumber = lastNumberStr.replace(/\d+$/, padded);
      } else {
        invoiceData.value.invoiceNumber = lastNumberStr + '-1';
      }
    } else {
      const year = new Date().getFullYear();
      invoiceData.value.invoiceNumber = `INV-${year}-001`;
    }
  } catch (error) {
    console.error('Could not fetch last invoice number', error)
  }
}

onMounted(() => {
  generateInvoiceNumber()
  fetchServerData()
})

const resizeTextarea = (event) => {
  const el = event.target
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

// Clients storage on server
const savedClients = ref([])
const selectedClientName = ref('')

const selectClient = () => {
  const client = savedClients.value.find(c => c.name === selectedClientName.value)
  if (client) {
    invoiceData.value.client = { 
      name: client.name || '',
      address: client.address || '',
      kvk: client.kvk || '',
      vat: client.vat || '',
      iban: client.iban || '',
      email: client.email || '',
      phone: client.phone || ''
    }
  }
}

const isClientDropdownOpen = ref(false)
const selectCustomClient = (name) => {
  selectedClientName.value = name
  selectClient()
  isClientDropdownOpen.value = false
}

const deleteClient = () => {
  if (!selectedClientName.value) return
  openConfirm(
    'Klant verwijderen',
    'Weet je zeker dat je deze klant wilt verwijderen?',
    async () => {
      const clientName = selectedClientName.value
      await supabase.from('clients').delete().eq('name', clientName)
      savedClients.value = savedClients.value.filter(c => c.name !== clientName)
      selectedClientName.value = ''
      invoiceData.value.client = { name: '', address: '', kvk: '', vat: '', iban: '', email: '', phone: '' }
    }
  )
}

const saveClientToServer = async () => {
  const client = invoiceData.value.client
  if (!client.name) return

  const existingIndex = savedClients.value.findIndex(c => c.name === client.name)
  const clientData = { ...client }
  
  if (existingIndex >= 0) {
    const id = savedClients.value[existingIndex].id
    if (id) await supabase.from('clients').update(clientData).eq('id', id)
    savedClients.value[existingIndex] = { ...savedClients.value[existingIndex], ...clientData }
  } else {
    const { data } = await supabase.from('clients').insert(clientData).select().single()
    if (data) savedClients.value.push(data)
  }
}

// Items storage on server
const savedItems = ref([])
const openItemDropdownId = ref(null)

const toggleItemDropdown = (id) => {
  openItemDropdownId.value = openItemDropdownId.value === id ? null : id
}

const selectSavedItem = (targetItem, savedItem) => {
  targetItem.description = savedItem.description
  openItemDropdownId.value = null
}

const deleteSavedItem = (description) => {
  openConfirm(
    'Dienst verwijderen',
    'Weet je zeker dat je deze dienst wilt verwijderen?',
    async () => {
      await supabase.from('saved_items').delete().eq('description', description)
      savedItems.value = savedItems.value.filter(i => i.description !== description)
    }
  )
}

const saveItemsToServer = async () => {
  for (const item of invoiceData.value.items) {
    if (!item.description) continue
    const existingIndex = savedItems.value.findIndex(i => i.description === item.description)
    if (existingIndex < 0) {
      const { data } = await supabase.from('saved_items').insert({ description: item.description }).select().single()
      if (data) {
        savedItems.value.push(data)
      } else {
        savedItems.value.push({ description: item.description })
      }
    }
  }
}

const fetchServerData = async () => {
  try {
    const [clientsRes, itemsRes] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('saved_items').select('*')
    ])
    if (clientsRes.data) savedClients.value = clientsRes.data
    if (itemsRes.data) savedItems.value = itemsRes.data
  } catch (error) {
    console.error('Error fetching server data', error)
  }
}

// BTW rates available
const btwRates = [21, 9, 0]

// Logic for items
const addItem = () => {
  invoiceData.value.items.push({
    id: Date.now(),
    description: '',
    quantity: 1,
    price: 22,
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
  return invoiceData.value.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price || 0)), 0)
})

const btwBreakdown = computed(() => {
  const breakdown = { 21: 0, 9: 0, 0: 0 }
  invoiceData.value.items.forEach(item => {
    const itemTotal = (item.quantity || 0) * (item.price || 0)
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
  if (!c.name || !c.address || !c.kvk || !c.btw || !c.iban) return false
  if (!kl.name) return false

  for (const item of invoiceData.value.items) {
    if (!item.description || item.quantity <= 0 || item.price === '' || item.price < 0) return false
  }

  return true
}

// Modal and Saving logic
const showModal = ref(false)
const showValidationModal = ref(false)
const showErrors = ref(false)
const isSaving = ref(false)

const openModal = () => {
  if (!validateForm()) {
    showErrors.value = true
    showValidationModal.value = true
    return
  }
  showErrors.value = false
  showModal.value = true
}

const saveToSupabase = async () => {
  isSaving.value = true
  await saveClientToServer()
  await saveItemsToServer()

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

const confirmModal = ref({
  isOpen: false,
  title: '',
  message: '',
  onConfirm: null
})

const openConfirm = (title, message, onConfirm) => {
  confirmModal.value = { isOpen: true, title, message, onConfirm }
}

const closeConfirm = () => {
  confirmModal.value.isOpen = false
}

const confirmAction = () => {
  if (confirmModal.value.onConfirm) confirmModal.value.onConfirm()
  closeConfirm()
}

const resetForm = () => {
  openConfirm(
    'Nieuwe factuur maken',
    'Wilt u een nieuwe factuur maken?',
    () => {
      invoiceData.value.invoiceNumber = ''
      invoiceData.value.date = new Date().toISOString().split('T')[0]
      invoiceData.value.dueDate = getDueDate(14)
      invoiceData.value.client = { name: '', address: '', kvk: '', vat: '', iban: '', email: '', phone: '' }
      selectedClientName.value = ''
      invoiceData.value.items = [ { id: Date.now(), description: '', quantity: 1, price: 22, btwRate: 21 } ]
      showErrors.value = false
      generateInvoiceNumber()
    }
  )
}

// History logic
const showHistory = ref(false)
const isLoadingHistory = ref(false)
const invoicesHistory = ref([])

const fetchHistory = async () => {
  isLoadingHistory.value = true
  showHistory.value = true
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    invoicesHistory.value = data
  } catch (error) {
    console.error('Error fetching history:', error)
    alert('Fout bij ophalen geschiedenis: ' + error.message)
  } finally {
    isLoadingHistory.value = false
  }
}

const loadInvoice = (invoice) => {
  openConfirm(
    'Oude factuur laden',
    'Huidige gegevens worden overschreven. Doorgaan?',
    () => {
      invoiceData.value = JSON.parse(JSON.stringify(invoice.data))
      showHistory.value = false
    }
  )
}
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-4 md:p-8 print:p-0 print:bg-white font-sans text-gray-900">
    <!-- Invoice Container -->
    <div class="mx-auto max-w-4xl bg-white p-4 md:p-12 print:p-0 print:shadow-none shadow-xl rounded-2xl relative" id="invoice-document">

      <!-- Header -->
      <div class="flex flex-col md:flex-row justify-between items-start border-b border-gray-200 pb-8 mb-8 print:pb-4 print:mb-6 gap-6">
        <div class="w-full">
          <h1 class="text-4xl print:text-2xl font-bold text-gray-800 tracking-tight">Factuur</h1>
          <div class="mt-4 print:mt-2 flex flex-col gap-3 md:gap-2 print:gap-1">
            <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span class="text-gray-500 w-32 font-medium sm:font-normal">Factuurnummer:</span>
              <input v-model="invoiceData.invoiceNumber" type="text" placeholder="INV-2023-001" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.invoiceNumber}" class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:flex-none" />
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span class="text-gray-500 w-32 font-medium sm:font-normal">Factuurdatum:</span>
              <input v-model="invoiceData.date" type="date" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.date}" class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:flex-none" />
            </div>
            <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
              <span class="text-gray-500 w-32 font-medium sm:font-normal">Vervaldatum:</span>
              <input v-model="invoiceData.dueDate" type="date" class="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 sm:flex-none" />
            </div>
          </div>
        </div>
      </div>

      <!-- Addresses -->
      <div class="flex flex-col md:flex-row print:flex-row justify-between gap-6 md:gap-12 mb-12 print:mb-6">
        <div class="flex-1 bg-gray-50 p-4 md:p-6 print:p-2 print:bg-transparent rounded-xl">
          <h3 class="text-lg font-semibold text-gray-700 mb-4 print:mb-2 border-b pb-2">Van (ZZP)</h3>
          <div class="flex flex-col gap-3 print:gap-1">
            <div class="grid grid-cols-[50px_1fr] items-center gap-2">
              <span class="text-sm text-gray-500">Naam:</span>
              <input v-model="invoiceData.company.name" type="text" placeholder="Bedrijfsnaam / Naam" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.company.name}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-start gap-2">
              <span class="text-sm text-gray-500 mt-2 print:mt-1">Adres:</span>
              <textarea v-model="invoiceData.company.address" @input="resizeTextarea" placeholder="Volledig adres" rows="1" style="overflow: hidden; height: auto;" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.company.address}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent resize-none min-h-[40px]"></textarea>
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2">
              <span class="text-sm text-gray-500">KVK:</span>
              <input v-model="invoiceData.company.kvk" type="text" placeholder="KVK nummer" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.company.kvk}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2">
              <span class="text-sm text-gray-500">BTW:</span>
              <input v-model="invoiceData.company.btw" type="text" placeholder="BTW-id" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.company.btw}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2">
              <span class="text-sm text-gray-500">IBAN:</span>
              <input v-model="invoiceData.company.iban" type="text" placeholder="IBAN" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.company.iban}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2" :class="{'print:hidden': !invoiceData.company.phone}">
              <span class="text-sm text-gray-500">Tel:</span>
              <input v-model="invoiceData.company.phone" type="text" placeholder="Telefoonnummer" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>
          </div>
        </div>

        <div class="flex-1 bg-blue-50 p-6 print:p-2 print:bg-transparent rounded-xl">
          <div class="flex justify-between items-center border-b border-blue-200 pb-2 mb-4 print:mb-2 relative">
            <h3 class="text-lg font-semibold text-blue-800">Aan (Klant)</h3>
            <div class="print:hidden" v-if="savedClients.length > 0">
              <div class="flex items-center gap-1">
                <button @click="isClientDropdownOpen = !isClientDropdownOpen" type="button" class="relative z-20 flex items-center justify-between w-40 bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all shadow-sm">
                  <span class="truncate font-medium">{{ selectedClientName || 'Kies klant...' }}</span>
                  <svg class="w-4 h-4 ml-1 opacity-70 transition-transform duration-200" :class="{'rotate-180': isClientDropdownOpen}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                <button @click="deleteClient" class="text-red-400 hover:text-red-600 transition-colors disabled:opacity-30 p-1.5 rounded-lg hover:bg-red-50" :disabled="!selectedClientName" title="Verwijderen">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>

              <div v-if="isClientDropdownOpen" class="absolute right-8 top-12 md:top-8 z-30 w-48 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden">
                <div class="max-h-48 overflow-y-auto py-1">
                  <button @click="selectCustomClient('')" class="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 transition-colors italic">Kies klant...</button>
                  <button v-for="c in savedClients" :key="c.name" @click="selectCustomClient(c.name)" class="w-full text-left px-4 py-2 text-sm text-gray-800 hover:bg-blue-50 hover:text-blue-700 transition-colors font-medium">
                    {{ c.name }}
                  </button>
                </div>
              </div>
              <div v-if="isClientDropdownOpen" @click="isClientDropdownOpen = false" class="fixed inset-0 z-10"></div>
            </div>
          </div>
          <div class="flex flex-col gap-3 print:gap-1">
            <div class="grid grid-cols-[50px_1fr] items-center gap-2">
              <span class="text-sm text-blue-600/70">Naam:</span>
              <input v-model="invoiceData.client.name" type="text" placeholder="Naam klant / Bedrijf" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !invoiceData.client.name}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2" :class="{'print:hidden': !invoiceData.client.kvk}">
              <span class="text-sm text-blue-600/70">KVK:</span>
              <input v-model="invoiceData.client.kvk" type="text" placeholder="KVK-nummer (optioneel)" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2" :class="{'print:hidden': !invoiceData.client.vat}">
              <span class="text-sm text-blue-600/70">BTW:</span>
              <input v-model="invoiceData.client.vat" type="text" placeholder="BTW-nummer (optioneel)" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2" :class="{'print:hidden': !invoiceData.client.iban}">
              <span class="text-sm text-blue-600/70">IBAN:</span>
              <input v-model="invoiceData.client.iban" type="text" placeholder="IBAN (optioneel)" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2" :class="{'print:hidden': !invoiceData.client.email}">
              <span class="text-sm text-blue-600/70">Email:</span>
              <input v-model="invoiceData.client.email" type="email" placeholder="E-mailadres (optioneel)" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-center gap-2" :class="{'print:hidden': !invoiceData.client.phone}">
              <span class="text-sm text-blue-600/70">Tel:</span>
              <input v-model="invoiceData.client.phone" type="text" placeholder="Telefoonnummer (optioneel)" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent" />
            </div>

            <div class="grid grid-cols-[50px_1fr] items-start gap-2" :class="{'print:hidden': !invoiceData.client.address}">
              <span class="text-sm text-blue-600/70 mt-2 print:mt-1">Adres:</span>
              <textarea v-model="invoiceData.client.address" @input="resizeTextarea" placeholder="Volledig adres (optioneel)" rows="1" style="overflow: hidden; height: auto;" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-3 py-2 print:py-1 bg-transparent resize-none min-h-[40px]"></textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Items Table -->
      <div class="overflow-hidden">
        <div class="mb-12 print:mb-6 overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
        <table class="w-full text-left border-collapse min-w-150">
          <thead>
            <tr class="bg-gray-100 text-gray-700 text-xs uppercase tracking-wider">
              <th class="p-4 rounded-tl-lg">Omschrijving</th>
              <th class="p-4 w-24">Aantal</th>
              <th class="p-4 w-32">Prijs (ex. BTW)</th>
              <th class="p-4 w-24">BTW %</th>
              <th class="p-4 rounded-tr-lg text-right">Bedrag</th>
              <th class="p-4 w-12 print:hidden"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in invoiceData.items" :key="item.id" class="border-b border-gray-100 hover:bg-gray-50 transition-colors print:text-sm relative">
              <td class="p-2 relative">
                <div class="relative w-full">
                  <input v-model="item.description" type="text" placeholder="Omschrijving" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && !item.description}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 print:py-0 bg-transparent pr-8" />
                  <button @click="toggleItemDropdown(item.id)" class="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 p-1 print:hidden" title="Opgeslagen diensten">
                    <svg class="w-4 h-4 transition-transform duration-200" :class="{'rotate-180': openItemDropdownId === item.id}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                  </button>

                  <div v-if="openItemDropdownId === item.id" class="absolute z-30 w-72 mt-1 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden left-0 print:hidden">
                    <div class="max-h-48 overflow-y-auto py-1">
                      <div v-for="si in savedItems" :key="si.description" class="flex items-center justify-between px-2 py-1 hover:bg-blue-50 group transition-colors">
                        <button @click="selectSavedItem(item, si)" class="text-left text-sm text-gray-800 font-medium truncate flex-1 px-2 py-1">{{ si.description }}</button>
                        <button @click.stop="deleteSavedItem(si.description)" class="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-100 transition-colors" title="Verwijderen">
                          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                      <div v-if="savedItems.length === 0" class="px-4 py-3 text-sm text-gray-500 italic text-center">Geen opgeslagen diensten. <br/><span class="text-xs">Ze worden automatisch opgeslagen.</span></div>
                    </div>
                  </div>
                </div>
                <div v-if="openItemDropdownId === item.id" @click="openItemDropdownId = null" class="fixed inset-0 z-20 print:hidden"></div>
              </td>
              <td class="p-2">
                <input v-model.number="item.quantity" type="number" min="1" step="0.1" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && (!item.quantity || item.quantity <= 0)}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 bg-transparent" />
              </td>
              <td class="p-2">
                <div class="relative w-full flex items-center">
                  <span class="absolute left-2 text-gray-500 font-medium">€</span>
                  <input v-model.number="item.price" type="number" min="0" step="0.01" placeholder="22" :class="{'border-red-500! ring-2! ring-red-200!': showErrors && (item.price === '' || item.price < 0)}" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded pl-6 pr-2 py-1 bg-transparent" />
                </div>
              </td>
              <td class="p-2">
                <select v-model.number="item.btwRate" class="w-full border border-transparent hover:border-gray-300 focus:border-blue-500 rounded px-2 py-1 bg-transparent">
                  <option v-for="rate in btwRates" :key="rate" :value="rate">{{ rate }}%</option>
                </select>
              </td>
              <td class="p-2 text-right font-medium text-gray-700">
                {{ formatCurrency((item.quantity || 0) * (item.price || 0)) }}
              </td>
              <td class="p-2 text-center print:hidden">
                <button @click="removeItem(item.id)" class="text-red-400 hover:text-red-600 transition-colors font-bold" title="Verwijderen" v-if="invoiceData.items.length > 1">
                  &times;
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        <button @click="addItem" class="mt-4 text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center gap-1 transition-colors print:hidden">
          <span class="text-lg">+</span> Regel toevoegen
        </button>
      </div>
      </div>

      <!-- Totals -->
      <div class="flex justify-end mb-8 print:mb-4">
        <div class="w-full sm:w-80 bg-gray-50 p-6 rounded-xl">
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
    <div class="mx-auto max-w-4xl mt-8 flex flex-col sm:flex-row justify-end gap-4 print:hidden">
      <button @click="fetchHistory" class="w-full sm:w-auto bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 font-semibold py-3 px-8 rounded-xl shadow-sm transition-colors sm:mr-auto">
        Factuurgeschiedenis
      </button>
      <button @click="resetForm" class="w-full sm:w-auto bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 font-semibold py-3 px-8 rounded-xl shadow-sm transition-colors">
        Nieuwe factuur
      </button>
      <button @click="openModal" class="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
        Factuur opslaan
      </button>
    </div>

    <!-- Validation Modal Overlay -->
    <div v-if="showValidationModal" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
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

    <!-- History Sidebar Overlay -->
    <div v-if="showHistory" class="fixed inset-0 z-50 overflow-hidden print:hidden">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" @click="showHistory = false"></div>
      <div class="fixed inset-y-0 right-0 max-w-md w-full flex">
        <div class="w-full h-full bg-white shadow-2xl flex flex-col">
          <div class="p-6 border-b flex justify-between items-center bg-gray-50">
            <h2 class="text-xl font-bold text-gray-800">Factuurgeschiedenis</h2>
            <button @click="showHistory = false" class="text-gray-400 hover:text-gray-600 text-3xl leading-none">&times;</button>
          </div>
          <div class="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            <div v-if="isLoadingHistory" class="text-center text-gray-500 py-8">Laden...</div>
            <div v-else-if="invoicesHistory.length === 0" class="text-center text-gray-500 py-8">Geen facturen gevonden.</div>
            <div v-else class="flex flex-col gap-3">
              <div v-for="inv in invoicesHistory" :key="inv.id" @click="loadInvoice(inv)" class="p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-md cursor-pointer transition-all bg-white group">
                <div class="flex justify-between items-start mb-2">
                  <span class="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">{{ inv.invoice_number || 'N/A' }}</span>
                  <span class="text-sm font-bold text-green-600">{{ formatCurrency(inv.total) }}</span>
                </div>
                <div class="text-sm text-gray-500 flex justify-between">
                  <span>{{ new Date(inv.created_at).toLocaleDateString('nl-NL') }}</span>
                  <span class="truncate ml-4 max-w-36">{{ inv.data?.client?.name || 'Onbekend' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Modal Overlay -->
    <div v-if="confirmModal.isOpen" class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 transform transition-all text-center relative">
        <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
          <svg class="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">{{ confirmModal.title }}</h3>
        <p class="text-sm text-gray-500 mb-6">{{ confirmModal.message }}</p>
        <div class="flex gap-3">
          <button @click="closeConfirm" class="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none transition-colors">
            Annuleren
          </button>
          <button @click="confirmAction" class="flex-1 rounded-xl border border-transparent bg-blue-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none transition-colors">
            Doorgaan
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
