import { useState, useRef, useEffect } from 'react'
import { MapPinIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { pakistanCities, filterCities } from '../data/pakistanCities'

const CityAutocomplete = ({ 
  value = '', 
  onChange, 
  onBlur,
  name,
  placeholder = 'Select or type city name',
  required = false,
  error = null,
  className = ''
}) => {
  const [searchTerm, setSearchTerm] = useState(value || '')
  const [filteredCities, setFilteredCities] = useState(pakistanCities)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (value !== searchTerm) {
      setSearchTerm(value || '')
    }
  }, [value])

  useEffect(() => {
    const filtered = filterCities(searchTerm)
    setFilteredCities(filtered)
    setHighlightedIndex(-1)
  }, [searchTerm])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleInputChange = (e) => {
    const newValue = e.target.value
    setSearchTerm(newValue)
    setShowDropdown(true)
    onChange({ target: { name, value: newValue } })
  }

  const handleCitySelect = (city) => {
    setSearchTerm(city)
    setShowDropdown(false)
    onChange({ target: { name, value: city } })
    inputRef.current?.blur()
  }

  const handleKeyDown = (e) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setShowDropdown(true)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev < filteredCities.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < filteredCities.length) {
          handleCitySelect(filteredCities[highlightedIndex])
        } else if (filteredCities.length === 1) {
          handleCitySelect(filteredCities[0])
        }
        break
      case 'Escape':
        setShowDropdown(false)
        setHighlightedIndex(-1)
        break
      default:
        break
    }
  }

  const handleFocus = () => {
    setShowDropdown(true)
  }

  const hasError = error !== null && error !== undefined

  return (
    <div className="relative">
      <div className="relative">
        <MapPinIcon 
          className={`absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${
            hasError ? 'text-red-400' : 'text-gray-400'
          }`} 
        />
        <input
          ref={inputRef}
          type="text"
          name={name}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={`w-full pl-10 pr-10 py-2 border-2 rounded-md focus:outline-none focus:ring-2 bg-white text-gray-900 transition-colors ${
            hasError
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500 bg-red-50' 
              : 'border-gray-300 focus:ring-pink-500 focus:border-pink-500'
          } ${className}`}
        />
        <ChevronDownIcon 
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 ${
            hasError ? 'text-red-400' : 'text-gray-400'
          } transition-transform ${showDropdown ? 'rotate-180' : ''}`} 
        />
      </div>

      {showDropdown && filteredCities.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border-2 border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {filteredCities.slice(0, 10).map((city, index) => (
            <div
              key={city}
              onClick={() => handleCitySelect(city)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`px-4 py-2 cursor-pointer transition-colors ${
                index === highlightedIndex
                  ? 'bg-pink-100 text-pink-900'
                  : 'hover:bg-gray-100 text-gray-900'
              }`}
            >
              {city}
            </div>
          ))}
          {filteredCities.length > 10 && (
            <div className="px-4 py-2 text-sm text-gray-500 border-t border-gray-200">
              +{filteredCities.length - 10} more cities
            </div>
          )}
        </div>
      )}

      {hasError && (
        <p className="mt-1 text-red-600 text-sm font-medium flex items-center gap-1.5">
          <span className="text-red-500">●</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

export default CityAutocomplete

