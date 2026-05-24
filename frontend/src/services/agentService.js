import api from './api'

const agentService = {
  getStatus:     ()       => api.get('/agent/status'),
  getConfig:     ()       => api.get('/agent/config'),
  updateConfig:  (data)   => api.put('/agent/config', data),
  getSessions:   (params) => api.get('/agent/sessions', { params }),
  getSession:    (id)     => api.get(`/agent/sessions/${id}`),
  resetSession:  (id)     => api.post(`/agent/sessions/${id}/reset`),
  cancelSession: (id)     => api.post(`/agent/sessions/${id}/cancel`),
  testAI:        (msg)    => api.post('/agent/test', { message: msg }),
}

export default agentService
