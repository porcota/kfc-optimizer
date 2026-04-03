import { useState, useEffect, useCallback } from 'react'

export function useMenu() {
  const [items, setItems] = useState([])
  const [sets, setSets] = useState([])
  const [sideGroups, setSideGroups] = useState({})
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const res = await fetch('./menu.json')
      const data = await res.json()
      setItems(data.items)
      setSets(data.sets)
      setSideGroups(data.sideGroups)
      setFetchedAt(new Date(data.updated))
      setStatus('success')
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { items, sets, sideGroups, status, error, fetchedAt, reload: load }
}
