import { useState } from 'react'
import { PlusIcon, XMarkIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { pakistanCities } from '../data/pakistanCities'

function CityChargesEditor({ charges = {}, defaultCharge = 200, onChargesChange, onDefaultChange }) {
  const [newCity, setNewCity] = useState('')
  const [newCharge, setNewCharge] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [citySearch, setCitySearch] = useState('')

  const filteredCities = citySearch
    ? pakistanCities.filter(city => 
        city.toLowerCase().includes(citySearch.toLowerCase()) &&
        !charges[city]
      )
    : pakistanCities.filter(city => !charges[city])

  const handleAddCity = () => {
    if (newCity && newCharge && parseFloat(newCharge) >= 0) {
      const updatedCharges = { ...charges, [newCity]: parseFloat(newCharge) }
      onChargesChange(updatedCharges)
      setNewCity('')
      setNewCharge('')
      setCitySearch('')
      setShowAddForm(false)
    }
  }

  const handleRemoveCity = (city) => {
    const updatedCharges = { ...charges }
    delete updatedCharges[city]
    onChargesChange(updatedCharges)
  }

  const handleCitySelect = (city) => {
    setNewCity(city)
    setCitySearch('')
  }

  return (
    <div className="space-y-4">
      {/* Default City Charge */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Default City Charge (Rs.)
          <span className="text-gray-500 text-xs ml-2 font-normal">
            Used when city is not in the list below
          </span>
        </label>
        <input
          type="number"
          value={defaultCharge}
          onChange={(e) => onDefaultChange(parseFloat(e.target.value) || 0)}
          min="0"
          step="0.01"
          className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
        />
      </div>

      {/* City Charges List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            City-Specific Charges
          </label>
          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center px-3 py-1.5 text-sm font-medium text-pink-600 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors"
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Add City
          </button>
        </div>

        {showAddForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select City
                </label>
                <div className="relative">
                  <MapPinIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder="Search or type city name"
                    className="w-full pl-10 pr-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                  />
                  {citySearch && filteredCities.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border-2 border-gray-300 rounded-lg shadow-lg max-h-48 overflow-auto">
                      {filteredCities.slice(0, 10).map((city) => (
                        <div
                          key={city}
                          onClick={() => handleCitySelect(city)}
                          className="px-4 py-2 cursor-pointer hover:bg-pink-50 text-gray-900"
                        >
                          {city}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {newCity && (
                  <div className="mt-2 px-3 py-2 bg-pink-50 border border-pink-200 rounded-lg">
                    <span className="text-sm text-pink-700">Selected: {newCity}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shipping Charge (Rs.)
                </label>
                <input
                  type="number"
                  value={newCharge}
                  onChange={(e) => setNewCharge(e.target.value)}
                  placeholder="Enter charge amount"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 bg-white text-gray-900 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                />
              </div>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={handleAddCity}
                  disabled={!newCity || !newCharge || parseFloat(newCharge) < 0}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false)
                    setNewCity('')
                    setNewCharge('')
                    setCitySearch('')
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {Object.keys(charges).length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No city-specific charges configured. All cities will use the default charge.
          </div>
        ) : (
          <div className="space-y-2">
            {Object.entries(charges).map(([city, charge]) => (
              <div
                key={city}
                className="flex items-center justify-between p-3 bg-white border-2 border-gray-200 rounded-lg"
              >
                <div className="flex items-center">
                  <MapPinIcon className="h-5 w-5 text-gray-400 mr-2" />
                  <span className="font-medium text-gray-900">{city}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-gray-700">Rs. {charge.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCity(city)}
                    className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CityChargesEditor

