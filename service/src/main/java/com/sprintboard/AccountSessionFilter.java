package com.sprintboard;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Registered only in the security chain, before CSRF and authorization checks. */
final class AccountSessionFilter extends OncePerRequestFilter {
  private final AccountService accounts;
  AccountSessionFilter(AccountService accounts) { this.accounts = accounts; }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof AccountPrincipal principal
        && !accounts.sessionValid(principal)) {
      SecurityContextHolder.clearContext();
      var session = request.getSession(false);
      if (session != null) session.invalidate();
      // Session discovery must still be able to render the signed-out application.
      String path = request.getRequestURI().substring(request.getContextPath().length());
      if (path.startsWith("/api/") && !path.equals("/api/auth/session")) {
        response.setStatus(401);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write("{\"error\":\"Oturumunuz sona erdi. Yeniden giriş yapın.\"}");
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
